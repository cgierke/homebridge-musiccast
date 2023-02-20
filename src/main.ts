import {
    API,
    IndependentPlatformPlugin,
    Logging,
    PlatformConfig,
} from "homebridge";
import { Cache } from "./Cache";
import { YamahaAPI } from "./YamahaAPI";
import { Config, InputConfig, YamahaDevice } from "./YamahaDevice";

const PLUGIN_NAME = "homebridge-musiccast-multiroom";
const PLATFORM_NAME = "MusiccastMultiroom";

export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, MusiccastMultiroom);
};

interface MusiccastMultiroomConfig {
    platform: string;
    server: {
        host: string;
        volumePercentageLow?: number;
        volumePercentageHigh?: number;
        inputs: InputConfig[];
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
        const yamahaApi = new YamahaAPI(log);
        const serverConfig: Config = {
            host: config.server.host,
            clients: config.clients.map(item => item.host),
            inputs: config.server.inputs
        };
        if (config.server.volumePercentageLow !== undefined) {
            serverConfig.volumePercentageLow = config.server.volumePercentageLow;
        }
        if (config.server.volumePercentageHigh !== undefined) {
            serverConfig.volumePercentageHigh = config.server.volumePercentageHigh;
        }
        let device = new YamahaDevice(serverConfig, api, cache, log, yamahaApi);
        device.publishAccessory(PLUGIN_NAME);
        for (let client of config.clients) {
            let clientConfig: Config = {
                host: client.host,
                serverHost: config.server.host
            }
            if (client.volumePercentageLow !== undefined) {
                clientConfig.volumePercentageLow = client.volumePercentageLow;
            }
            if (client.volumePercentageHigh !== undefined) {
                clientConfig.volumePercentageHigh = client.volumePercentageHigh;
            }
            device = new YamahaDevice(clientConfig, api, cache, log, yamahaApi);
            device.publishAccessory(PLUGIN_NAME);
        }
    }
}
