import {
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    Service,
    Categories,
    Logging,
    PlatformAccessory,
} from "homebridge";
import { cache } from "./cache";
import { PlayInfoResponse, PresetInfo, yamahaAPI } from "./yamahaAPI";

interface VolumeStep {
    id: number;
    label: string;
    volume: number;
}
export class yamahaDevice {
    private readonly log: Logging;
    private readonly host: string;
    private readonly serverHost?: string;
    private readonly yamahaAPI: yamahaAPI;
    private readonly api: API;
    private readonly cache: cache;

    private readonly volumeStepCount: number = 6;
    private readonly volumePercentageLow: number = 25;
    private readonly volumePercentageHigh: number = 70;
    private readonly volumeCharacterActive: string = "■";
    private readonly volumeCharacterInactive: string = "□";

    private volumeSteps: VolumeStep[] = [];

    constructor(host: string, api: API, yamahaAPI: yamahaAPI, log: Logging, cache: cache, serverHost?: string) {
        this.log = log;
        this.host = host;
        this.api = api;
        this.yamahaAPI = yamahaAPI;
        this.cache = cache;
        this.serverHost = serverHost;
    }

    public async publishAccessory(pluginName: string) {
        await this.setInitialStatus();
        let { volumeAccessory, volumeService } = this.getVolumeAccessory(pluginName);
        if (this.serverHost) {
            this.api.publishExternalAccessories(pluginName, [volumeAccessory]);
            this.log.info(`published volumeAccessory ${this.host}`);
            this.cache.addCallback(this.host, this.updateStatus.bind(this), [volumeService]);
        } else {
            let { presetAccessory, presetService } = this.getInputPresetAccessory(pluginName);
            let { lipSyncAccessory, lipSyncService } = this.getLipSyncAccessory(pluginName);
            let { surroundDecoderAccessory, surroundDecoderService } = this.getSurroundDecoderAccessory(pluginName);
            this.api.publishExternalAccessories(pluginName, [volumeAccessory, presetAccessory, lipSyncAccessory, surroundDecoderAccessory]);
            this.log.info(`published volumeAccessory,presetAccessory,lipSyncAccessory,surroundDecoderAccessory ${this.host}`);
            this.cache.addCallback(this.host, this.updateStatus.bind(this), [volumeService, presetService, lipSyncService, surroundDecoderService]);
        }
    }

    private async setInitialStatus() {
        this.cache.set(this.host, 'deviceInfo', await this.yamahaAPI.getDeviceInfo(this.host));
        this.cache.set(this.host, 'presetInfo', await this.yamahaAPI.getPresetInfo(this.host));
        this.cache.set(this.host, 'status', await this.yamahaAPI.getStatus(this.host));
        this.cache.set(this.host, 'playInfo', await this.yamahaAPI.getPlayInfo(this.host));
        this.volumeSteps = this.getVolumeSteps();
        this.log.info("volumeSteps", this.volumeSteps);
    }

    private getVolumeSteps(): VolumeStep[] {
        let steps: VolumeStep[] = [];
        for (let i = 0; i < this.volumeStepCount; i++) {
            let label: string = "";
            for (let j = 0; j <= i; j++) {
                label += this.volumeCharacterActive;
            }
            for (let j = i + 1; j < this.volumeStepCount; j++) {
                label += this.volumeCharacterInactive;
            }
            let volumeLow = this.cache.get(this.host, 'status').max_volume / 100 * this.volumePercentageLow;
            let volumeHigh = this.cache.get(this.host, 'status').max_volume / 100 * this.volumePercentageHigh;
            let volumeStep = (volumeHigh - volumeLow) / (this.volumeStepCount - 1);
            let volume = Math.round(volumeLow + (volumeStep * i));
            let step: VolumeStep = { id: i, label: label, volume: volume }
            steps.push(step);
        }
        return steps;
    }

    private async updateStatus(volumeService?: Service, presetService?: Service, lipSyncService?: Service, surroundDecoderService?: Service) {
        const lastStatus = this.cache.get(this.host, 'status');
        const status = await this.yamahaAPI.getStatus(this.host);
        const poweredOn = this.getCurrentPowerSwitchStatus();
        const userActivity = JSON.stringify(lastStatus) !== JSON.stringify(status);
        this.cache.set(this.host, 'status', status);
        this.cache.ping(this.host, poweredOn, userActivity);
        this.updateStatusFromCache(volumeService, presetService, lipSyncService, surroundDecoderService);
        if (this.getCurrentPowerSwitchStatus() && presetService) {
            this.cache.set(this.host, 'playInfo', await this.yamahaAPI.getPlayInfo(this.host));
            this.updateStatusFromCache(volumeService, presetService, lipSyncService, surroundDecoderService);
        }
    }

    private async updateStatusFromCache(volumeService?: Service, presetService?: Service, lipSyncService?: Service, surroundDecoderService?: Service) {
        if (volumeService) {
            const active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
            volumeService.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
            volumeService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier).updateValue(this.getCurrentVolumePresetId());
        }
        if (presetService) {
            const active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
            presetService.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
            presetService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier).updateValue(await this.getCurrentInputPresetId());
        }
        if (lipSyncService) {
            lipSyncService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(this.getCurrentLipSyncSwitchStatus());
        }
        if (surroundDecoderService) {
            surroundDecoderService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(this.getCurrentSurroundDecoderSwitchStatus());
        }
    }

    private getCurrentVolumePresetId(): number {
        var volume = this.cache.get(this.host, 'status').volume;
        var closest = this.volumeSteps.reduce(function (prev, curr) {
            return (Math.abs(curr.volume - volume) < Math.abs(prev.volume - volume) ? curr : prev);
        });
        return closest.id;
    }

    private async getCurrentInputPresetId(): Promise<number> {
        if (this.cache.get(this.host, 'status').input == "hdmi1") {
            return 0;
        } else {
            let playInfo: PlayInfoResponse = this.cache.get(this.host, 'playInfo');
            if (playInfo.playback == 'play' && playInfo.track == '' && playInfo.artist == '' && playInfo.play_time == 0) {
                // stream just started, try again (forever - but playback=play and play_time=0 cannot last long)
                this.cache.set(this.host, 'playInfo', await this.yamahaAPI.getPlayInfo(this.host));
                return this.getCurrentInputPresetId();
            }
            let presetId = 0;
            for (let presetInfo of this.cache.get(this.host, 'presetInfo').preset_info) {
                presetId++;
                if (presetInfo.text == playInfo.track || presetInfo.text == playInfo.artist) {
                    return presetId;
                }
            }
            if (playInfo.playback == 'play') {
                this.log.info("getCurrentInputPresetId empty", this.cache.get(this.host, 'presetInfo'), this.cache.get(this.host, 'playInfo'));
            }
            return 0;
        }
    }

    private getCurrentPowerSwitchStatus(): boolean {
        return this.cache.get(this.host, 'status').power == "on";
    }

    private getCurrentLipSyncSwitchStatus(): boolean {
        return this.cache.get(this.host, 'status').link_audio_delay == "lip_sync";
    }

    private getCurrentSurroundDecoderSwitchStatus(): boolean {
        return this.cache.get(this.host, 'status').sound_program == "surr_decoder";
    }

    private async recallInputPreset(presetId: number) {
        if (presetId == 0) {
            await this.yamahaAPI.setInput(this.host, "hdmi1");
        } else {
            await this.yamahaAPI.recallPreset(this.host, presetId as number);
        }
    }

    private async recallVolumePreset(presetId: number) {
        var volume: number = 0;
        var volumeStep = this.volumeSteps.find(function (volumeStep) {
            return presetId == volumeStep.id;
        });
        if (volumeStep) {
            volume = volumeStep.volume;
        }
        await this.yamahaAPI.setVolume(this.host, volume);
    }

    private async link(serverHost: string) {
        await this.yamahaAPI.setPower(serverHost, 1);
        await this.yamahaAPI.setClientInfo(this.host, serverHost);
        await this.yamahaAPI.setServerInfo(this.host, serverHost);
        await this.yamahaAPI.startDistribution(serverHost);
    }

    private addServiceAccessoryInformation(accessory: PlatformAccessory) {
        accessory.getService(this.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.api.hap.Characteristic.Manufacturer, "Yamaha")
            .setCharacteristic(this.api.hap.Characteristic.Model, this.cache.get(this.host, 'deviceInfo').model_name)
            .setCharacteristic(this.api.hap.Characteristic.SerialNumber, this.cache.get(this.host, 'deviceInfo').serial_number + " " + this.host)
            .setCharacteristic(this.api.hap.Characteristic.SoftwareRevision, this.cache.get(this.host, 'deviceInfo').api_version.toString())
            .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, this.cache.get(this.host, 'deviceInfo').system_version.toString());
    }

    private getVolumeAccessory(pluginName: string) {
        const name = this.cache.get(this.host, 'deviceInfo').model_name;
        const service = new this.api.hap.Service.Television(name);
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.host}-volume`);
        const accessory = new this.api.platformAccessory(name, uuid, this.serverHost ? Categories.SPEAKER : Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            })
            .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.yamahaAPI.setPower(this.host, active as number);
                await this.updateStatus(service);
                callback(this.api.hap.HAPStatus.SUCCESS);
                if (active == this.api.hap.Characteristic.Active.ACTIVE && this.serverHost) {
                    await this.link(this.serverHost);
                }
            });
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentVolumePresetId());
            })
            .on(CharacteristicEventTypes.SET, async (presetId: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.recallVolumePreset(presetId as number);
                await this.updateStatus(service);
                callback();
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
        return { volumeAccessory: accessory, volumeService: service };
    }

    private getInputPresetAccessory(pluginName: string) {
        const service = new this.api.hap.Service.Television();
        const name = "Preset " + this.cache.get(this.host, 'deviceInfo').model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.host}-preset`);
        const accessory = new this.api.platformAccessory(name, uuid, Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let active = this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
                callback(this.api.hap.HAPStatus.SUCCESS, active);
            })
            .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.yamahaAPI.setPower(this.host, active as number);
                await this.updateStatus(undefined, service, undefined, undefined);
                callback(this.api.hap.HAPStatus.SUCCESS);
                if (active == this.api.hap.Characteristic.Active.ACTIVE && this.serverHost) {
                    await this.link(this.serverHost);
                }
            });
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, await this.getCurrentInputPresetId());
            })
            .on(CharacteristicEventTypes.SET, async (presetId: CharacteristicValue, callback: CharacteristicSetCallback) => {
                await this.recallInputPreset(presetId as number);
                await this.updateStatus(undefined, service, undefined, undefined);
                callback();
            });
        let presetId = 0;
        let presetId0Name = (this.serverHost) ? "verbunden" : "Apple TV";
        let inputSource = accessory.addService(this.api.hap.Service.InputSource, presetId0Name, presetId.toString());
        inputSource
            .setCharacteristic(this.api.hap.Characteristic.Identifier, presetId)
            .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, presetId0Name)
            .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
        service.addLinkedService(inputSource);
        for (var presetInfo of this.cache.get(this.host, 'presetInfo').preset_info) {
            presetId++;
            if (presetId > 20) {
                break;
            }
            inputSource = accessory.addService(this.api.hap.Service.InputSource, presetInfo.text, presetId.toString());
            inputSource
                .setCharacteristic(this.api.hap.Characteristic.Identifier, presetId)
                .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, presetInfo.text)
                .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
            service.addLinkedService(inputSource);
        }
        return { presetAccessory: accessory, presetService: service };
    }

    private getLipSyncAccessory(pluginName: string) {
        const service = new this.api.hap.Service.Switch();
        const name = "lippensynchron " + this.cache.get(this.host, 'deviceInfo').model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.host}-lipsync`);
        const accessory = new this.api.platformAccessory(name, uuid, Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service
            .getCharacteristic(this.api.hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentLipSyncSwitchStatus());
            })
            .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                let audioDelay = value as boolean ? "lip_sync" : "audio_sync";
                await this.yamahaAPI.setLinkAudioDelay(this.host, audioDelay);
                await this.updateStatus(undefined, undefined, service, undefined);
                callback();
            });
        return { lipSyncAccessory: accessory, lipSyncService: service };
    }

    private getSurroundDecoderAccessory(pluginName: string) {
        const service = new this.api.hap.Service.Switch();
        const name = "Surround Decoder " + this.cache.get(this.host, 'deviceInfo').model_name;
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.host}-surround`)
        const accessory = new this.api.platformAccessory(name, uuid, Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        service
            .getCharacteristic(this.api.hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                callback(this.api.hap.HAPStatus.SUCCESS, this.getCurrentSurroundDecoderSwitchStatus());
            })
            .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                let program = value as boolean ? "surr_decoder" : "straight";
                await this.yamahaAPI.setSoundProgram(this.host, program);
                await this.updateStatus(undefined, undefined, undefined, service);
                callback();
            });
        return { surroundDecoderAccessory: accessory, surroundDecoderService: service };
    }
}
