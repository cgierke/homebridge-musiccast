import {
    API,
    IndependentPlatformPlugin,
    Logging,
    PlatformConfig,
} from "homebridge";
import { Cache } from "./Cache";
import { YamahaAPI } from "./YamahaAPI";
import { Config, InputConfig, YamahaDevice } from "./YamahaDevice";
import crypto from "crypto";

const PLUGIN_NAME = "homebridge-musiccast-multiroom";
const PLATFORM_NAME = "MusiccastMultiroom";

export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, MusiccastMultiroom);
};

interface MusiccastMultiroomConfig {
    platform: string;
    name: string;
    server: {
        host: string;
        volumePercentageLow?: number;
        volumePercentageHigh?: number;
        inputs: InputConfig[];
        presetInfoRegex?: string;
    };
    clients: {
        host: string;
        volumePercentageLow?: number;
        volumePercentageHigh?: number;
    }[];
}

class MusiccastMultiroom implements IndependentPlatformPlugin {
    constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
        const config = platformConfig as MusiccastMultiroomConfig;
        const cache = new Cache(log);
        var presetInfoRegex: RegExp | undefined;
        if (config.server.presetInfoRegex !== undefined) {
            try {
                presetInfoRegex = new RegExp(config.server.presetInfoRegex, 'g'); //g
            } catch (error) {
                log.info('invalid regex', error);
            }
        }
        const devices: YamahaDevice[] = [];
        try {
            var serverConfig: Config = {
                host: config.server.host,
                inputs: config.server.inputs
            };
            if (config.clients !== undefined) {
                serverConfig.clients = config.clients.map(item => item.host);
            } else {
                serverConfig.clients = [];
            }
            if (config.server.volumePercentageLow !== undefined) {
                serverConfig.volumePercentageLow = config.server.volumePercentageLow;
            }
            if (config.server.volumePercentageHigh !== undefined) {
                serverConfig.volumePercentageHigh = config.server.volumePercentageHigh;
            }
        } catch (error) {
            log.error("invalid config", error);
            return
        }
        const groupId = crypto.createHash('md5').update(config.server.host).digest("hex");
        const yamahaApi = new YamahaAPI(log, groupId, presetInfoRegex);
        const serverDevice = new YamahaDevice(serverConfig, api, cache, log, yamahaApi);
        devices.push(serverDevice);
        if (config.clients !== undefined) {
            try {
                for (let client of config.clients) {
                    var clientConfig: Config = {
                        host: client.host,
                        serverDevice: serverDevice
                    }
                    if (client.volumePercentageLow !== undefined) {
                        clientConfig.volumePercentageLow = client.volumePercentageLow;
                    }
                    if (client.volumePercentageHigh !== undefined) {
                        clientConfig.volumePercentageHigh = client.volumePercentageHigh;
                    }
                    devices.push(new YamahaDevice(clientConfig, api, cache, log, yamahaApi));
                }
            } catch (error) {
                log.error("invalid config", error);
                return
            }
        }
        for (let device of devices) {
            device.publishAccessory(PLUGIN_NAME);
        }
    }
}
