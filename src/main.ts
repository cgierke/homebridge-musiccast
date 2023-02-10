import {
    API,
    IndependentPlatformPlugin,
    Logging,
    PlatformConfig,
} from "homebridge";
import { cache } from "./cache";
import { yamahaAPI } from "./yamahaAPI";
import { yamahaDevice } from "./yamahaDevice";

const PLUGIN_NAME = "homebridge-musiccast-multiroom";
const PLATFORM_NAME = "MusiccastMultiroomPlugin";

export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, MusiccastMultiroom);
};

interface MusiccastMultiroomConfig {
    platform: string;
    server: string;
    clients: (string)[];
}

class MusiccastMultiroom implements IndependentPlatformPlugin {
    constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
        const config = platformConfig as MusiccastMultiroomConfig;
        const deviceCache = new cache(log);
        const yamahaApi = new yamahaAPI(log);

        const server = new yamahaDevice(config.server, api, yamahaApi, log, deviceCache)
        server.publishAccessory(PLUGIN_NAME);

        for (let clientHost of config.clients) {
            let client = new yamahaDevice(clientHost, api, yamahaApi, log, deviceCache, config.server);
            client.publishAccessory(PLUGIN_NAME);
        }
    }
}
