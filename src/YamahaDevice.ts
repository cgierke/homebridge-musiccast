import type {
    API,
    CharacteristicValue,
    Logging,
    PlatformAccessory,
    Service,
} from "homebridge";
import type { Cache } from "./Cache";
import type {
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
    private readonly volumeStepCount: number = 6;
    private readonly volumePercentageLowDefault: number = 25;
    private readonly volumePercentageHighDefault: number = 65;
    private readonly volumeCharacterActive: string = "■";
    private readonly volumeCharacterInactive: string = "□";

    private volumeSteps: VolumeStep[] = [];
    // last input/favorite that matched what the device is playing, 0 = none seen yet
    private lastInputPresetIdentifier: number = 0;

    constructor(
        private readonly config: Config,
        private readonly api: API,
        private readonly cache: Cache,
        private readonly log: Logging,
        private readonly yamahaAPI: YamahaAPI,
    ) {
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
        const accessories: PlatformAccessory[] = [];
        const services: StatusServices = {};

        const { volumeAccessory, volumeService } = this.getVolumeAccessory(pluginName);
        this.log.info("publishing accessory " + volumeAccessory.displayName);
        accessories.push(volumeAccessory);
        services.volumeService = volumeService;
        if (!this.config.serverDevice) {
            const { presetAccessory, presetService } = this.getInputPresetAccessory(pluginName, this.config.inputs!);
            this.log.info("publishing accessory " + presetAccessory.displayName);
            accessories.push(presetAccessory);
            services.presetService = presetService;
            if (this.shouldPublishLipSyncSwitch()) {
                const { lipSyncAccessory, lipSyncService } = this.getLipSyncAccessory(pluginName);
                this.log.info("publishing accessory " + lipSyncAccessory.displayName);
                accessories.push(lipSyncAccessory);
                services.lipSyncService = lipSyncService;
            }
            if (this.shouldPublishSurroundDecoderSwitch()) {
                const { surroundDecoderAccessory, surroundDecoderService } = this.getSurroundDecoderAccessory(pluginName);
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
        const steps: VolumeStep[] = [];
        for (let i = 0; i < this.volumeStepCount; i++) {
            let label: string = "";
            for (let j = 0; j <= i; j++) {
                label += this.volumeCharacterActive;
            }
            for (let j = i + 1; j < this.volumeStepCount; j++) {
                label += this.volumeCharacterInactive;
            }
            const volume = Math.round(volumeLow + (volumeStep * i));
            const step: VolumeStep = { id: i + 1, label: label, volume: volume }
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
        let status: StatusResponse;
        if (this.getCurrentPowerSwitchStatus() && services.presetService) {
            let playInfo: PlayInfoResponse;
            [status, playInfo] = await Promise.all([
                this.yamahaAPI.getStatus(this.getHost()),
                this.yamahaAPI.getPlayInfo(this.getHost())
            ]);
            this.cache.set(this.getHost(), 'playInfo', playInfo);
        } else {
            status = await this.yamahaAPI.getStatus(this.getHost());
        }
        const lastStatus: StatusResponse = this.cache.get(this.getHost(), 'status');
        const userActivity = JSON.stringify(lastStatus) !== JSON.stringify(status);
        this.cache.set(this.getHost(), 'status', status);
        const poweredOn = this.getCurrentPowerSwitchStatus();
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
            const presetId = this.getCurrentInputPresetIdentifier();
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
        for (const inputConfig of this.config.inputs!) {
            if (statusInfo.input === inputConfig.input) {
                return this.lastInputPresetIdentifier = inputConfig.identifier;
            }
        }
        const playInfo: PlayInfoResponse = this.cache.get(this.getHost(), 'playInfo');
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (const presetInfo of presetInfos.preset_info) {
            if ((playInfo.input === 'server' || playInfo.input === 'net_radio') && (presetInfo.text === playInfo.track || presetInfo.text === playInfo.artist)) {
                return this.lastInputPresetIdentifier = presetInfo.identifier;
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
        for (const inputConfig of this.config.inputs!) {
            if (inputConfig.identifier === identifier) {
                input = inputConfig.input;
                break;
            }
        }
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (const presetInfo of presetInfos.preset_info) {
            if (presetInfo.identifier === identifier) {
                presetId = Number(presetInfo.presetId);
                break;
            }
        }
        if (input) {
            await this.yamahaAPI.setInput(this.getHost(), input);
        } else if (presetId) {
            await this.yamahaAPI.recallPreset(this.getHost(), presetId);
        }
        return this.waitFor(() => this.getCurrentInputPresetIdentifier() === identifier);
    }

    private async recallVolumePreset(presetId: number) {
        let volume: number = 0;
        const volumeStep = this.volumeSteps.find(function (volumeStep) {
            return presetId === volumeStep.id;
        });
        if (volumeStep) {
            volume = volumeStep.volume;
        }
        await this.yamahaAPI.setVolume(this.getHost(), volume);
        return this.waitFor(() => this.getCurrentVolumePresetId() === presetId);
    }

    private async setPower(status: boolean) {
        await this.yamahaAPI.setPower(this.getHost(), status);
        return this.waitFor(() => this.getCurrentPowerSwitchStatus() === status);
    }

    /**
     * Re-reads the device status until the condition is met, but never longer than maxWait,
     * so HomeKit gets its answer in time even if the device is slow or unreachable.
     */
    private async waitFor(condition: () => boolean, maxWait: number = 3000) {
        const delay = 500;
        const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
        let expired = false;
        const poll = async () => {
            while (!condition() && !expired) {
                await sleep(delay);
                await this.refreshStatus().catch(error => this.log.debug("refreshStatus failed", error));
            }
        };
        await Promise.race([poll(), sleep(maxWait).then(() => { expired = true; })]);
    }

    private async refreshStatus() {
        const requests: Promise<unknown>[] = [
            this.yamahaAPI.getStatus(this.getHost()).then(status => this.cache.set(this.getHost(), 'status', status))
        ];
        if (!this.config.serverDevice) {
            requests.push(this.yamahaAPI.getPlayInfo(this.getHost()).then(playInfo => this.cache.set(this.getHost(), 'playInfo', playInfo)));
        }
        await Promise.all(requests);
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
            for (const client of this.config.clients) {
                await this.yamahaAPI.setPower(client, false);
                this.cache.ping(client, false, true);
            }
        }
    }

    /**
     * Runs a set handler. If the device could not be reached, the reason is logged
     * and HomeKit gets a communication error.
     */
    private async guard(action: () => Promise<unknown>) {
        try {
            await action();
        } catch (error) {
            this.logError(error);
            throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    private logError(error: unknown) {
        this.log.error(`${this.getHost()}:`, error instanceof Error ? error.message : error);
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

    /**
     * Power on/off for a Television service, shared by the volume and the input accessory.
     */
    private addPowerHandlers(service: Service) {
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .onGet(() => this.getCurrentPowerSwitchStatus() ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE)
            .onSet((active: CharacteristicValue) => this.guard(async () => {
                await this.setPower(Boolean(active));
                this.cache.ping(this.getHost(), Boolean(active), true);
                if (active === this.api.hap.Characteristic.Active.ACTIVE && this.config.serverDevice) {
                    this.cache.ping(this.config.serverDevice.getHost(), true, true);
                    this.linkWithHost().catch(error => this.logError(error));
                }
                if (active === this.api.hap.Characteristic.Active.INACTIVE) {
                    this.powerOffClients().catch(error => this.logError(error));
                }
            }));
    }

    private getVolumeAccessory(pluginName: string) {
        const deviceInfo: DeviceInfoResponse = this.cache.get(this.getHost(), 'deviceInfo');
        const service = new this.api.hap.Service.Television(deviceInfo.model_name);
        const uuid = this.api.hap.uuid.generate(`${pluginName}-${this.getHost()}-volume`);
        const accessory = new this.api.platformAccessory(deviceInfo.model_name, uuid, this.config.serverDevice ? this.api.hap.Categories.SPEAKER : this.api.hap.Categories.AUDIO_RECEIVER);
        accessory.addService(service);
        this.addServiceAccessoryInformation(accessory);
        this.addPowerHandlers(service);
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .onGet(() => this.getCurrentVolumePresetId())
            .onSet((presetId: CharacteristicValue) => this.guard(async () => {
                await this.setPower(true);
                await this.recallVolumePreset(presetId as number);
                this.cache.ping(this.getHost(), undefined, true);
            }));
        for (const volumeStep of this.volumeSteps) {
            const inputSource = accessory.addService(this.api.hap.Service.InputSource, `Volume ${volumeStep.id}`, volumeStep.id.toString());
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
        this.addPowerHandlers(service);
        service
            .getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            // when the device plays something unlisted, keep showing the last known input
            .onGet(() => this.getCurrentInputPresetIdentifier() ?? this.lastInputPresetIdentifier)
            .onSet((presetId: CharacteristicValue) => this.guard(async () => {
                await this.setPower(true);
                await this.recallInputPreset(presetId as number);
                this.cache.ping(this.getHost(), undefined, true);
            }));
        for (const inputConfig of inputConfigs) {
            const inputSource = accessory.addService(this.api.hap.Service.InputSource, inputConfig.name, inputConfig.identifier.toString());
            inputSource
                .setCharacteristic(this.api.hap.Characteristic.Identifier, inputConfig.identifier)
                .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, inputConfig.name)
                .setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.APPLICATION);
            service.addLinkedService(inputSource);
        }
        const presetInfos: PresetInfoResponse = this.cache.get(this.getHost(), 'presetInfo');
        for (const presetInfo of presetInfos.preset_info) {
            const inputSource = accessory.addService(this.api.hap.Service.InputSource, presetInfo.displayText, presetInfo.identifier.toString());
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
            .onGet(() => this.getCurrentLipSyncSwitchStatus())
            .onSet((value: CharacteristicValue) => this.guard(async () => {
                const audioDelay = value as boolean ? "lip_sync" : "audio_sync";
                await this.yamahaAPI.setLinkAudioDelay(this.getHost(), audioDelay);
                this.cache.ping(this.getHost(), undefined, true);
            }));
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
            .onGet(() => this.getCurrentSurroundDecoderSwitchStatus())
            .onSet((value: CharacteristicValue) => this.guard(async () => {
                const program = value as boolean ? "surr_decoder" : "straight";
                await this.yamahaAPI.setSoundProgram(this.getHost(), program);
                this.cache.ping(this.getHost(), undefined, true);
            }));
        return { surroundDecoderAccessory: accessory, surroundDecoderService: service };
    }
}
