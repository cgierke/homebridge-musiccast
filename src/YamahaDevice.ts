import {
    API,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    Logging,
    PlatformAccessory,
    Service,
} from "homebridge";
import { Cache } from "./Cache";
import {
    DeviceInfoResponse,
    FeatureResponse,
    PlayInfoResponse,
    PresetInfoResponse,
    StatusResponse,
    YamahaAPI
} from "./YamahaAPI";

export interface Config {
    host: string;
    serverDevice?: YamahaDevice;
    clients?: string[];
    inputs?: InputConfig[];
    volumePercentageLow?: number;
    volumePercentageHigh?: number;
}
export interface InputConfig {
    identifier: number;
    input: string;
    name: string;
}
interface VolumeStep {
    id: number;
    label: string;
    volume: number;
}
interface StatusServices {
    volumeService?: Service;
    presetService?: Service;
    lipSyncService?: Service;
    surroundDecoderService?: Service;
}

export class YamahaDevice {
    private readonly api: API;
    private readonly cache: Cache;
    private readonly config: Config;
    private readonly log: Logging;
    private readonly yamahaAPI: YamahaAPI;

    private readonly volumeStepCount: number = 6;
    private readonly volumePercentageLowDefault: number = 25;
    private readonly volumePercentageHighDefault: number = 65;
    private readonly volumeCharacterActive: string = "■";
    private readonly volumeCharacterInactive: string = "□";

    private volumeSteps: VolumeStep[] = [];

    constructor(config: Config, api: API, cache: Cache, log: Logging, yamahaAPI: YamahaAPI) {
        this.api = api;
        this.cache = cache;
        this.config = config;
        this.log = log;
        this.yamahaAPI = yamahaAPI;
        if (!config.serverDevice) {
            if (this.config.inputs !== undefined) {
                for (let i = 0; i < this.config.inputs.length; i++) {
                    this.config.inputs[i].identifier = i + 100;
                }
            } else {
                this.config.inputs = [];
            }
            if (this.config.clients === undefined) {
                this.config.clients = [];
            }
        }
    }

    public async publishAccessory(pluginName: string) {
        await this.setInitialStatus();
        let accessories: PlatformAccessory[] = [];
        let services: StatusServices = {};

        let { volumeAccessory, volumeService } = this.getVolumeAccessory(pluginName);
        this.log.info("publishing accessory " + volumeAccessory.displayName);
        accessories.push(volumeAccessory);
        services.volumeService = volumeService;
        if (!this.config.serverDevice) {
            let { presetAccessory, presetService } = this.getInputPresetAccessory(pluginName, this.config.inputs!);
            this.log.info("publishing accessory " + presetAccessory.displayName);
            accessories.push(presetAccessory);
            services.presetService = presetService;
            if (this.shouldPublishLipSyncSwitch()) {
                let { lipSyncAccessory, lipSyncService } = this.getLipSyncAccessory(pluginName);
                this.log.info("publishing accessory " + lipSyncAccessory.displayName);
                accessories.push(lipSyncAccessory);
                services.lipSyncService = lipSyncService;
            }
            if (this.shouldPublishSurroundDecoderSwitch()) {
                let { surroundDecoderAccessory, surroundDecoderService } = this.getSurroundDecoderAccessory(pluginName);
                this.log.info("publishing accessory " + surroundDecoderAccessory.displayName);
                accessories.push(surroundDecoderAccessory);
                services.surroundDecoderService = surroundDecoderService;
            }
        }
        this.api.publishExternalAccessories(pluginName, accessories);
        this.cache.setCallback(this.getHost(), this.updateStatus.bind(this), [services]);
    }

    public getHost(): string {
        return this.config.host
    }

    private async setInitialStatus() {
        this.cache.set(this.getHost(), 'deviceInfo', await this.yamahaAPI.getDeviceInfo(this.getHost()));
        this.cache.set(this.getHost(), 'presetInfo', await this.yamahaAPI.getPresetInfo(this.getHost()));
        this.cache.set(this.getHost(), 'status', await this.yamahaAPI.getStatus(this.getHost()));
        this.cache.set(this.getHost(), 'playInfo', await this.yamahaAPI.getPlayInfo(this.getHost()));
        this.cache.set(this.getHost(), 'features', await this.yamahaAPI.getFeatures(this.getHost()));
        this.volumeSteps = this.getVolumeSteps();
        this.log.debug("volumeSteps", this.volumeSteps);
    }

    private getVolumeSteps(): VolumeStep[] {
        const status: StatusResponse = this.cache.get(this.getHost(), 'status');
        let volumePercentageLow = this.volumePercentageLowDefault;
        let volumePercentageHigh = this.volumePercentageHighDefault;
        if (this.config.volumePercentageHigh !== undefined) {
            volumePercentageHigh = this.config.volumePercentageHigh;
        }
        if (this.config.volumePercentageLow !== undefined && this.config.volumePercentageLow < volumePercentageHigh) {
            volumePercentageLow = this.config.volumePercentageLow;
        }
        const volumeLow = status.max_volume / 100 * volumePercentageLow;
        const volumeHigh = status.max_volume / 100 * volumePercentageHigh;
        const volumeStep = (volumeHigh - volumeLow) / (this.volumeStepCount - 1);
        let steps: VolumeStep[] = [];
        for (let i = 0; i < this.volumeStepCount; i++) {
            let label: string = "";
            for (let j = 0; j <= i; j++) {
                label += this.volumeCharacterActive;
            }
            for (let j = i + 1; j < this.volumeStepCount; j++) {
                label += this.volumeCharacterInactive;
            }
            let volume = Math.round(volumeLow + (volumeStep * i));
            let step: VolumeStep = { id: i + 1, label: label, volume: volume }
            steps.push(step);
        }
        return steps;
    }

    private shouldPublishLipSyncSwitch(): boolean {
        const features: FeatureResponse = this.cache.get(this.getHost(), 'features');
        const mainZone = features.zone.find(function (zone) {
            return zone.id === 'main';
        });
        if (mainZone && mainZone.link_audio_delay_list?.includes("lip_sync") && mainZone.link_audio_delay_list.includes("audio_sync")) {
            return true;
        }
        return false;
    }

    private shouldPublishSurroundDecoderSwitch(): boolean {
        const features: FeatureResponse = this.cache.get(this.getHost(), 'features');
        const mainZone = features.zone.find(function (zone) {
            return zone.id === 'main';
        });
        if (mainZone && mainZone.sound_program_list?.includes("surr_decoder") && mainZone.sound_program_list.includes("straight")) {
            return true;
        }
        return false;
    }

    private async updateStatus(services: StatusServices) {
        var status: StatusResponse;
        if (this.getCurrentPowerSwitchStatus() && services.presetService) {
            var playInfo: PlayInfoResponse;
            [status, playInfo] = await Promise.all([
                this.yamahaAPI.getStatus(this.getHost()),
                this.yamahaAPI.getPlayInfo(this.getHost())
            ]);
            this.cache.set(this.getHost(), 'playInfo', playInfo);
        } else {
            status = await this.yamahaAPI.getStatus(this.getHost());
        }
        const lastStatus: StatusResponse = this.cache.get(this.getHost(), 'status');
        const poweredOn = this.getCurrentPowerSwitchStatus();
        const userActivity = JSON.stringify(lastStatus) !== JSON.stringify(status);
        this.cache.set(this.getHost(), 'status', status);
        this.cache.ping(this.getHost(), poweredOn, userActivity);
        this.updateStatusFromCache(services);
    }

    private updateStatusFromCache(services: StatusServices) {
        if (services.volumeService) {
            const active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
            services.volumeService.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
            services.volumeService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier).updateValue(this.getCurrentVolumePresetId());
        }
        if (services.presetService) {
            const active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
            services.presetService.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
            let presetId = this.getCurrentInputPresetIdentifier();
            if (presetId !== undefined) {
                services.presetService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier).updateValue(presetId);
            }
        }
        if (services.lipSyncService) {
            services.lipSyncService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(this.getCurrentLipSyncSwitchStatus());
        }
        if (services.surroundDecoderService) {
            services.surroundDecoderService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(this.getCurrentSurroundDecoderSwitchStatus());
        }
    }

    private getCurrentVolumePresetId(): number {
        const status: StatusResponse = this.cache.get(this.getHost(), 'status');
        const closest = this.volumeSteps.reduce(function (prev, curr) {
            return (Math.abs(curr.volume - status.volume) < Math.abs(prev.volume - status.volume) ? curr : prev);
        });
        return closest.id;
    }

    private getCurrentInputPresetIdentifier(): number | undefined {
        const statusInfo: StatusResponse = this.cache.get(this.getHost(), 'status');
        for (let inputConfig of this.config.inputs!) {
            if (statusInfo.input === inputConfig.input) {
                return inputConfig.identifier;
            }
        }
        const playInfo: PlayInfoResponse = this.cache.get(this.getHost(), 'playInfo');
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (let presetInfo of presetInfos.preset_info) {
            if ((playInfo.input === 'server' || playInfo.input === 'net_radio') && (presetInfo.text === playInfo.track || presetInfo.text === playInfo.artist)) {
                return presetInfo.identifier;
            }
        }
        return undefined;
    }

    private getCurrentPowerSwitchStatus(): boolean {
        const status: StatusResponse = this.cache.get(this.getHost(), 'status');
        return status.power === "on";
    }

    private getCurrentLipSyncSwitchStatus(): boolean {
        const status: StatusResponse = this.cache.get(this.getHost(), 'status');
        return status.link_audio_delay === "lip_sync";
    }

    private getCurrentSurroundDecoderSwitchStatus(): boolean {
        const status: StatusResponse = this.cache.get(this.getHost(), 'status');
        return status.sound_program === "surr_decoder";
    }

    private async recallInputPreset(identifier: number) {
        let input: string | undefined;
        let presetId: number | undefined;
        for (let inputConfig of this.config.inputs!) {
            if (inputConfig.identifier === identifier) {
                input = inputConfig.input;
                break;
            }
        }
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (let presetInfo of presetInfos.preset_info) {
            if (presetInfo.identifier === identifier) {
                presetId = Number(presetInfo.presetId);
                break;
            }
        }
        if (input) {
            this.yamahaAPI.setInput(this.getHost(), input);
        } else if (presetId) {
            this.yamahaAPI.recallPreset(this.getHost(), presetId);
        }
        return this.waitForInputPreset(identifier);
    }

    private async waitForInputPreset(identifier: number, maxWait: number = 10000) {
        const delay = 1000;
        const currentPresetIdentifier = this.getCurrentInputPresetIdentifier();
        if (currentPresetIdentifier !== identifier && maxWait > 0) {
            return setTimeout(async () => {
                await this.waitForInputPreset(identifier, maxWait - delay);
            }, delay);
        }
    }

    private async recallVolumePreset(presetId: number) {
        var volume: number = 0;
        const volumeStep = this.volumeSteps.find(function (volumeStep) {
            return presetId === volumeStep.id;
        });
        if (volumeStep) {
            volume = volumeStep.volume;
        }
        this.yamahaAPI.setVolume(this.getHost(), volume);
        return this.waitForVolumePreset(presetId);
    }

    private async waitForVolumePreset(presetId: number, maxWait: number = 10000) {
        const delay = 1000;
        const currentPresetId = this.getCurrentVolumePresetId();
        if (currentPresetId !== presetId && maxWait > 0) {
            return setTimeout(async () => {
                await this.waitForVolumePreset(presetId, maxWait - delay);
            }, delay);
        }
    }

    private async setPower(status: boolean) {
        this.yamahaAPI.setPower(this.getHost(), status);
        return this.waitForPower(status);
    }

    private async waitForPower(status: boolean, maxWait: number = 10000) {
        const delay = 1000;
        const currentStatus = this.getCurrentPowerSwitchStatus();
        if (currentStatus !== status && maxWait > 0) {
            return setTimeout(async () => {
                await this.waitForPower(status, maxWait - delay);
            }, delay);
        }
    }

    private async linkWithHost() {
        if (this.config.serverDevice) {
            await this.config.serverDevice.setPower(true);
            await this.setPower(true);
            await this.yamahaAPI.setServerInfo(this.getHost(), this.config.serverDevice.getHost(), 'remove');
            await this.yamahaAPI.setClientInfo(this.getHost(), this.config.serverDevice.getHost());
            await this.yamahaAPI.setServerInfo(this.getHost(), this.config.serverDevice.getHost(), 'add');
            await this.yamahaAPI.startDistribution(this.config.serverDevice.getHost());
        }
    }

    private async powerOffClients() {
        if (this.config.clients) {
            for (let client of this.config.clients) {
                await this.yamahaAPI.setPower(client, false);
                this.cache.ping(client, false, true);
            }
        }
    }

    private addServiceAccessoryInformation(accessory: PlatformAccessory) {
        const deviceInfo: DeviceInfoResponse = this.cache.get(this.getHost(), 'deviceInfo');
        accessory.getService(this.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.api.hap.Characteristic.Manufacturer, "Yamaha")
            .setCharacteristic(this.api.hap.Characteristic.Model, deviceInfo.model_name)
            .setCharacteristic(this.api.hap.Characteristic.SerialNumber, deviceInfo.serial_number + " " + this.getHost())
            .setCharacteristic(this.api.hap.Characteristic.SoftwareRevision, deviceInfo.api_version.toString())
            .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, deviceInfo.system_version.toString());
    }

    private getVolumeAccessory(pluginName: string) {
        const deviceInfo: DeviceInfoResponse = this.cache.get(this.getHost(), 'deviceInfo');
        const service = new this.api.hap.Service.Television(deviceInfo.model_name);
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.getHost()}-volume`);
        const accessory = new this.api.platformAccessory(deviceInfo.model_name, uuid, this.config.serverDevice ? this.api.hap.Categories.SPEAKER : this.api.hap.Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(this.api.hap.CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.setPower(Boolean(active));
                this.cache.ping(this.getHost(), Boolean(active), true);
                if (active === this.api.hap.Characteristic.Active.ACTIVE && this.config.serverDevice) {
                    this.cache.ping(this.config.serverDevice.getHost(), true, true);
                    this.linkWithHost();
                }
                if (active === this.api.hap.Characteristic.Active.INACTIVE) {
                    this.powerOffClients();
                }
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            });
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .on(this.api.hap.CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentVolumePresetId());
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (presetId: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.setPower(true);
                await this.recallVolumePreset(presetId as number);
                this.cache.ping(this.getHost(), undefined, true);
                callback(this.api.hap.HAPStatus.SUCCESS, presetId);
            });
        for (var volumeStep of this.volumeSteps) {
            let inputSource = accessory.addService(this.api.hap.Service.InputSource, volumeStep.label, volumeStep.id.toString());
            inputSource
                .setCharacteristic(this.api.hap.Characteristic.Identifier, volumeStep.id)
                .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, volumeStep.label)
                .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
            service.addLinkedService(inputSource);
        }
        const displayOrder = this.volumeSteps.map(step => step.id);
        service.setCharacteristic(this.api.hap.Characteristic.DisplayOrder, this.api.hap.encode(1, displayOrder).toString('base64'));
        return { volumeAccessory: accessory, volumeService: service };
    }

    private getInputPresetAccessory(pluginName: string, inputConfigs: InputConfig[]) {
        const service = new this.api.hap.Service.Television();
        const deviceInfo: DeviceInfoResponse = this.cache.get(this.getHost(), 'deviceInfo');
        const name = "Preset " + deviceInfo.model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.getHost()}-preset`);
        const accessory = new this.api.platformAccessory(name, uuid, this.api.hap.Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(this.api.hap.CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.setPower(Boolean(active));
                this.cache.ping(this.getHost(), Boolean(active), true);
                if (active === this.api.hap.Characteristic.Active.ACTIVE && this.config.serverDevice) {
                    this.cache.ping(this.config.serverDevice.getHost(), true, true);
                    this.linkWithHost();
                }
                if (active === this.api.hap.Characteristic.Active.INACTIVE) {
                    this.powerOffClients();
                }
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            });
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .on(this.api.hap.CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentInputPresetIdentifier());
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (presetId: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.setPower(true);
                await this.recallInputPreset(presetId as number);
                this.cache.ping(this.getHost(), undefined, true);
                callback(this.api.hap.HAPStatus.SUCCESS, presetId);
            });
        for (let inputConfig of inputConfigs) {
            let inputSource = accessory.addService(this.api.hap.Service.InputSource, inputConfig.name, inputConfig.identifier.toString());
            inputSource
                .setCharacteristic(this.api.hap.Characteristic.Identifier, inputConfig.identifier)
                .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, inputConfig.name)
                .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
            service.addLinkedService(inputSource);
        }
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (let presetInfo of presetInfos.preset_info) {
            let inputSource = accessory.addService(this.api.hap.Service.InputSource, presetInfo.displayText, presetInfo.identifier.toString());
            inputSource
                .setCharacteristic(this.api.hap.Characteristic.Identifier, presetInfo.identifier)
                .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, presetInfo.displayText)
                .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
            service.addLinkedService(inputSource);
        }
        const displayOrder = inputConfigs.map(inputConfig => inputConfig.identifier).concat(presetInfos.preset_info.map(presetInfo => presetInfo.identifier));
        service.setCharacteristic(this.api.hap.Characteristic.DisplayOrder, this.api.hap.encode(1, displayOrder).toString('base64'));
        return { presetAccessory: accessory, presetService: service };
    }

    private getLipSyncAccessory(pluginName: string) {
        const service = new this.api.hap.Service.Switch();
        const deviceInfo: DeviceInfoResponse = this.cache.get(this.getHost(), 'deviceInfo');
        const name = "LipSync " + deviceInfo.model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.getHost()}-lipsync`);
        const accessory = new this.api.platformAccessory(name, uuid, this.api.hap.Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service
            .getCharacteristic(this.api.hap.Characteristic.On)
            .on(this.api.hap.CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentLipSyncSwitchStatus());
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                let audioDelay = value as boolean ? "lip_sync" : "audio_sync";
                await this.yamahaAPI.setLinkAudioDelay(this.getHost(), audioDelay);
                this.cache.ping(this.getHost(), undefined, true);
                callback(this.api.hap.HAPStatus.SUCCESS, value);
            });
        return { lipSyncAccessory: accessory, lipSyncService: service };
    }

    private getSurroundDecoderAccessory(pluginName: string) {
        const service = new this.api.hap.Service.Switch();
        const name = "Surround Decoder " + this.cache.get(this.getHost(), 'deviceInfo').model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.getHost()}-surround`)
        const accessory = new this.api.platformAccessory(name, uuid, this.api.hap.Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service
            .getCharacteristic(this.api.hap.Characteristic.On)
            .on(this.api.hap.CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentSurroundDecoderSwitchStatus());
            })
            .on(this.api.hap.CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                let program = value as boolean ? "surr_decoder" : "straight";
                await this.yamahaAPI.setSoundProgram(this.getHost(), program);
                this.cache.ping(this.getHost(), undefined, true);
                callback(this.api.hap.HAPStatus.SUCCESS, value);
            });
        return { surroundDecoderAccessory: accessory, surroundDecoderService: service };
    }
}
