import {
    Logging,
} from "homebridge";
import { DeviceInfoResponse, PlayInfoResponse, PresetInfoResponse, StatusResponse } from "./yamahaAPI";
interface yamahaDeviceCache {
    presetInfo?: PresetInfoResponse,
    status?: StatusResponse,
    playInfo?: PlayInfoResponse,
    deviceInfo?: DeviceInfoResponse,
}
export class cache {
    private log: Logging;
    private hosts: Set<string> = new Set();
    private cache: { [host: string]: yamahaDeviceCache } = {};
    private apiCallbacks: { [host: string]: { callback: Function, parameters: any[] }[] } = {};
    private cacheCallbacks: { [host: string]: { callback: Function, parameters: any[] }[] } = {};

    constructor(log: Logging) {
        this.log = log;
        this.apiUpdates();
        this.cacheUpdates();
    }
    private apiUpdates() {
        let updateIntervalInSeconds = 15;
        for (var host of this.hosts) {
            if (host in this.apiCallbacks) {
                for (var i in this.apiCallbacks[host]) {
                    this.apiCallbacks[host][i].callback(...this.apiCallbacks[host][i].parameters);
                }
            }
        }
        setTimeout(async () => {
            this.apiUpdates();
        }, updateIntervalInSeconds * 1000)
    }
    private cacheUpdates() {
        let updateIntervalInSeconds = 1;
        for (var host of this.hosts) {
            if (host in this.cacheCallbacks) {
                for (var i in this.cacheCallbacks[host]) {
                    this.cacheCallbacks[host][i].callback(...this.cacheCallbacks[host][i].parameters);
                }
            }
        }
        setTimeout(async () => {
            this.cacheUpdates();
        }, updateIntervalInSeconds * 1000)
    }
    public addApiCallback(host: string, callback: Function, parameters: any[]) {
        this.hosts.add(host);
        if (!(host in this.apiCallbacks)) {
            this.apiCallbacks[host] = [];
        }
        return this.apiCallbacks[host].push({ callback: callback, parameters: parameters });
    }
    public addCacheCallback(host: string, callback: Function, parameters: any[]) {
        this.hosts.add(host);
        if (!(host in this.cacheCallbacks)) {
            this.cacheCallbacks[host] = [];
        }
        return this.cacheCallbacks[host].push({ callback: callback, parameters: parameters });
    }
    public set(host: string, key: "presetInfo" | "status" | "playInfo" | "deviceInfo", value: any): any {
        if (!(host in this.cache)) {
            this.log.info(`cache init ${host}`);
            this.cache[host] = {};
        }
        return this.cache[host][key] = value;
    }
    public get(host: string, key: "presetInfo" | "status" | "playInfo" | "deviceInfo"): any {
        if (host in this.cache && key in this.cache[host]) {
            return this.cache[host][key];
        }
        this.log.info(`cache not found ${host} ${key}`);
    }
}
