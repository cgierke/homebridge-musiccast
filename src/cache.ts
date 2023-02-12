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
    private callbacks: { [host: string]: { callback: Function, parameters: any[] }[] } = {};
    private lastUserActivity: { [host: string]: Date } = {};
    private lastPoweredOn: { [host: string]: Date } = {};
    private lastStatusUpdate: { [host: string]: Date } = {};

    private readonly updateIntervalPoweredOff = 60 * 1000;
    private readonly updateIntervalPoweredOn = 20 * 1000;
    private readonly updateIntervalUserActivity = 1 * 1000;

    constructor(log: Logging) {
        this.log = log;
        this.update();
    }
    private update() {
        for (var host of this.hosts) {
            const now = new Date().getTime();
            if (
                (this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalPoweredOff))
                ||
                ((this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalPoweredOn)) && (this.lastPoweredOn[host].getTime() >= (now - this.updateIntervalPoweredOff)))
                ||
                ((this.lastStatusUpdate[host].getTime() <= (now - this.updateIntervalUserActivity)) && (this.lastUserActivity[host].getTime() >= (now - this.updateIntervalPoweredOn)))
            ) {
                //this.log.info("host/lastUpdate/lastActivity/now", host, this.lastUpdate[host].getTime(), this.lastActivity[host].getTime(), now);
                this.executeUpdatesForHost(host);
            }
        }
        setTimeout(async () => {
            this.update();
        }, 1000)
    }
    private executeUpdatesForHost(host: string) {
        this.lastStatusUpdate[host] = new Date();
        for (var i in this.callbacks[host]) {
            this.callbacks[host][i].callback(...this.callbacks[host][i].parameters);
        }
    }
    public addCallback(host: string, callback: Function, parameters: any[]) {
        this.hosts.add(host);
        this.lastUserActivity[host] = new Date();
        this.lastPoweredOn[host] = new Date();
        this.lastStatusUpdate[host] = new Date();
        if (!(host in this.callbacks)) {
            this.callbacks[host] = [];
        }
        return this.callbacks[host].push({ callback: callback, parameters: parameters });
    }
    public ping(host: string, poweredOn: boolean, userActivity: boolean) {
        if (poweredOn) {
            this.lastPoweredOn[host] = new Date();
        }
        if (userActivity) {
            this.lastUserActivity[host] = new Date();
        }
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
