import {
    Logging,
} from "homebridge";
import { DeviceInfoResponse, FeatureResponse, PlayInfoResponse, PresetInfoResponse, StatusResponse } from "./YamahaAPI";
interface YamahaDeviceCache {
    presetInfo?: PresetInfoResponse;
    status?: StatusResponse;
    playInfo?: PlayInfoResponse;
    deviceInfo?: DeviceInfoResponse;
    features?: FeatureResponse;
}
export class Cache {
    private readonly log: Logging;
    private readonly hosts: Set<string> = new Set();
    private readonly cache: { [host: string]: YamahaDeviceCache } = {};
    private readonly callbacks: { [host: string]: { callback: Function, parameters: any[] } } = {};
    private readonly lastUserActivity: { [host: string]: Date } = {};
    private readonly lastPoweredOn: { [host: string]: Date } = {};
    private readonly lastStatusUpdate: { [host: string]: Date } = {};

    private readonly updateIntervalPoweredOff = 60 * 1000;
    private readonly updateIntervalPoweredOn = 10 * 1000;
    private readonly updateIntervalUserActivity = 1 * 1000;

    constructor(log: Logging) {
        this.log = log;
        this.update();
    }
    private async update() {
        var promises: any[] = [];
        for (var host of this.hosts) {
            const now = new Date().getTime();
            if (
                (this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalPoweredOff))
                ||
                ((this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalPoweredOn)) && (this.lastPoweredOn[host].getTime() >= (now - this.updateIntervalPoweredOff)))
                ||
                ((this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalUserActivity)) && (this.lastUserActivity[host].getTime() >= (now - this.updateIntervalPoweredOn)))
            ) {
                promises.push(this.updateHost(host));
            }
        }
        setTimeout(async () => {
            this.update();
        }, 1000)
        return Promise.all(promises);
    }
    private async updateHost(host: string) {
        this.lastStatusUpdate[host] = new Date();
        if (host in this.callbacks) {
            return this.callbacks[host].callback(...this.callbacks[host].parameters);
        }
    }
    public setCallback(host: string, callback: Function, parameters: any[]) {
        this.hosts.add(host);
        this.lastUserActivity[host] = new Date();
        this.lastPoweredOn[host] = new Date();
        this.lastStatusUpdate[host] = new Date();
        return this.callbacks[host] = { callback: callback, parameters: parameters };
    }
    public ping(host: string, poweredOn?: boolean, userActivity?: boolean) {
        if (poweredOn) {
            this.lastPoweredOn[host] = new Date();
        }
        if (userActivity) {
            this.lastUserActivity[host] = new Date();
        }
    }
    public set(host: string, key: "presetInfo" | "status" | "playInfo" | "deviceInfo" | "features", value: any): any {
        if (!(host in this.cache)) {
            this.cache[host] = {};
        }
        return this.cache[host][key] = value;
    }
    public get(host: string, key: "presetInfo" | "status" | "playInfo" | "deviceInfo" | "features"): any {
        if (host in this.cache && key in this.cache[host]) {
            return this.cache[host][key];
        }
        this.log.error(`cache not found ${host} ${key}`);
    }
}
