"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Tooltip } from "react-tooltip";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// helper for dynamic sort order labels
function get_sort_order_labels(sort_by: "device_id" | "uptime" | "firmware_version" | "cpu_temperature" | "wifi_rssi") {
    switch (sort_by) {
        case "uptime":
        case "device_id":
        case "firmware_version":
        case "cpu_temperature":
            return { ascending: "Low to high", descending: "High to low" };
        case "wifi_rssi":
            return { ascending: "Weak to strong", descending: "Strong to weak" };
        default:
            return { ascending: "Ascending", descending: "Descending" };
    }
}

export default function Home() {

    // Dummy values for summary metrics (replace with real logic later)
    const avg_cpu_temp = 42.0;
    const avg_wifi_rssi = -61;
    const global_uptime_percent = 81.5;
    const latest_firmware_version = "1.2.3";

    const [devices, set_devices] = useState<any[]>([]);
    const [loading, set_loading] = useState(true);
    const [displayedUptime, setDisplayedUptime] = useState(0);

    const [search, set_search] = useState("");
    const [sort_by, set_sort_by] = useState<"device_id" | "uptime" | "firmware_version" | "cpu_temperature" | "wifi_rssi">("device_id");
    const [sort_order, set_sort_order] = useState<"ascending" | "descending">("ascending");
    const [online_first, set_online_first] = useState(true);



    useEffect(() => {
        const fetch_data = async () => {
            const { data, error } = await supabase
                .from("devices")
                .select("*");

            if (error) {
                console.error(error);
            } else {
                set_devices(data);
            }
            set_loading(false);
            // Artificial delay for loaders
            // setTimeout(() => set_loading(false), 2000);
        };

        fetch_data();
    }, []);

    // Animate the progress circle value when loading finishes
    useEffect(() => {
        let animationFrame: number;
        let startTimestamp: number | null = null;
        const duration = 900; // ms
        const end = global_uptime_percent;

        // Ease-out cubic function
        function easeOutCubic(t: number) {
            return 1 - Math.pow(1 - t, 3);
        }

        function animate(timestamp: number) {
            if (startTimestamp === null) startTimestamp = timestamp;
            const elapsed = timestamp - startTimestamp;
            const linearProgress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(linearProgress);
            setDisplayedUptime(easedProgress * end);
            if (linearProgress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setDisplayedUptime(end);
            }
        }

        if (!loading) {
            setDisplayedUptime(0);
            animationFrame = requestAnimationFrame(animate);
        } else {
            setDisplayedUptime(0);
        }
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [loading, global_uptime_percent]);

    function format_timestamp(timestamp: any) {
        if (timestamp == null) {
            return null;
        }

        const difference_ms = Date.now() - new Date(timestamp).getTime();
        const difference_min = Math.floor(difference_ms / (1000 * 60));
        const difference_hour = Math.floor(difference_min / 60);
        const difference_day = Math.floor(difference_hour / 24);

        let parts: string[] = [];
        if (difference_day > 0) parts.push(`${difference_day}d`);
        if (difference_hour > 0 || difference_day > 0) parts.push(`${difference_hour % 24}h`);
        if (difference_min > 0 || difference_hour > 0 || difference_day > 0) parts.push(`${difference_min % 60}m`);

        // Only add seconds if nothing else is present
        if (parts.length === 0) parts.push("0m");

        // Remove trailing zero units (e.g. "3d 5h 0m" => "3d 5h")
        while (parts.length > 1 && /^0[dhms]$/.test(parts[parts.length - 1])) {
            parts.pop();
        }

        return parts.join(" ");
    }

    function format_interval(seconds: string) {
        const seconds_number = parseInt(seconds, 10);
        const days = Math.floor(seconds_number / 86400); // 24*3600
        const hours = Math.floor((seconds_number % 86400) / 3600);
        const minutes = Math.floor((seconds_number % 3600) / 60);
        const secs = seconds_number % 60;

        let parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        // Remove trailing zero units (e.g. "3d 5h 0m" => "3d 5h")
        while (parts.length > 1 && /^0[dhms]$/.test(parts[parts.length - 1])) {
            parts.pop();
        }

        return parts.join(" ");
    }

    function check_null(value: any, suffix: string = "") {
        return value == null ? "-" : value + suffix;
    }

    function get_device_status(device: any): string {
        const last_updated_time = new Date(device.last_updated).getTime();
        const now = Date.now();
        const max_allowed_delay = (parseInt(device.update_interval) + 60) * 1000;
        return (now - last_updated_time > max_allowed_delay) ? "Offline" : "Broadcasting";
    }

    // filter by device ID
    const filtered_devices = devices.filter((device) =>
        device.device_id?.toString().toLowerCase().includes(search.toLowerCase())
    );

    // sorting logic
    function compareDevices(a: any, b: any) {
        let result = 0;
        if (sort_by === "device_id") {
            const id_a = a.device_id ?? "";
            const id_b = b.device_id ?? "";
            result = id_a.localeCompare(id_b, undefined, { numeric: true });
        } else if (sort_by === "uptime") {
            // Sort by uptime or downtime, regardless of status
            const status_a = get_device_status(a);
            const status_b = get_device_status(b);
            let val_a = 0, val_b = 0;
            if (status_a !== "Offline") {
                val_a = a.booted ? Date.now() - new Date(a.booted).getTime() : 0;
            } else {
                val_a = a.last_updated
                    ? Date.now() - (new Date(a.last_updated).getTime() + parseInt(a.update_interval) * 1000)
                    : 0;
            }
            if (status_b !== "Offline") {
                val_b = b.booted ? Date.now() - new Date(b.booted).getTime() : 0;
            } else {
                val_b = b.last_updated
                    ? Date.now() - (new Date(b.last_updated).getTime() + parseInt(b.update_interval) * 1000)
                    : 0;
            }
            result = val_a - val_b;
        } else if (sort_by === "firmware_version") {
            result = (a.firmware_version ?? "").localeCompare(b.firmware_version ?? "", undefined, { numeric: true });
        } else if (sort_by === "cpu_temperature") {
            result = (a.cpu_temperature ?? 0) - (b.cpu_temperature ?? 0);
        } else if (sort_by === "wifi_rssi") {
            result = (a.wifi_rssi ?? -999) - (b.wifi_rssi ?? -999);
        }
        return sort_order === "ascending" ? result : -result;
    }

    let sorted_devices: any[] = [];
    if (online_first) {
        const online = filtered_devices.filter(d => get_device_status(d) === "Broadcasting").sort(compareDevices);
        const offline = filtered_devices.filter(d => get_device_status(d) === "Offline").sort(compareDevices);
        sorted_devices = [...online, ...offline];
    } else {
        sorted_devices = [...filtered_devices].sort(compareDevices);
    }

    const sort_order_labels = get_sort_order_labels(sort_by);

    // count device statuses
    const status_counts = {
        Broadcasting: 0,
        Offline: 0,
    };

    devices.forEach((device) => {
        const status = get_device_status(device);
        status_counts[status as keyof typeof status_counts]++;
    });


    // Reference values
    const ESP_AVG_CURRENT = 0.0266; // Amps
    const ESP_VOLTAGE = 5; // Volts
    const HOURS_PER_DAY = 24;

    // Calculate daily kWh
    const daily_kwh = devices.length * ESP_AVG_CURRENT * ESP_VOLTAGE * HOURS_PER_DAY / 1000;
    const daily_kwh_display = daily_kwh.toLocaleString(undefined, { maximumFractionDigits: 3 });

    // Find device with longest uptime (online)
    let longest_uptime_device: any = null;
    let longest_uptime = 0;
    let online_devices = devices.filter((d) => get_device_status(d) === "Broadcasting");
    let offline_devices = devices.filter((d) => get_device_status(d) === "Offline");
    online_devices.forEach((device) => {
        if (device.booted) {
            const uptime = Date.now() - new Date(device.booted).getTime();
            if (uptime > longest_uptime) {
                longest_uptime = uptime;
                longest_uptime_device = device;
            }
        }
    });

    // Find device that has been offline the longest (last_updated furthest in the past)
    let longest_downtime_device: any = null;
    let oldest_last_updated = Date.now();
    offline_devices.forEach((device) => {
        if (device.last_updated) {
            const last_updated_time = new Date(device.last_updated).getTime();
            if (last_updated_time < oldest_last_updated) {
                oldest_last_updated = last_updated_time;
                longest_downtime_device = device;
            }
        }
    });

    // Average CPU temperature (online only)
    // Dummy values for summary metrics (replace with real logic later)

    return (
        <div className="flex flex-col min-h-screen bg-slate-900">
            <div className="flex flex-col m-8 gap-6 overflow-x-auto justify-start items-start">
                {/* New top row: Up, Longest Uptime, Avg WiFi, Avg Temp (each 1/4) */}
                <div className="flex w-full gap-x-6">
                    {/* Up devices */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Number of devices currently connected to WiFi"
                    >
                        <div className="relative flex-shrink-0 flex items-center justify-center ml-4 mr-9" style={{ width: 28, height: 28 }}>
                            <span className={"absolute w-15 h-15 rounded-full bg-green-400/20"} aria-hidden="true" />
                            <span className={"w-5 h-5 rounded-full bg-green-400"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-3xl font-bold text-white leading-none">{status_counts.Broadcasting}</span>
                            )}
                            <span className="text-base text-gray-300 mt-1">Up devices</span>
                        </div>
                    </div>
                    {/* Longest uptime */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Device with the longest continuous uptime"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-blue-400 select-none" style={{ fontSize: "4rem" }}>
                                power
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : longest_uptime_device ? (
                                <span className="font-bold leading-none">
                                    <span className="text-white text-xl align-middle">{longest_uptime_device.device_id}: </span>
                                    <span className="text-blue-300 text-xl align-middle">{format_timestamp(longest_uptime_device.booted)}</span>
                                </span>
                            ) : (
                                <span className="text-base text-gray-400">-</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Longest uptime</span>
                        </div>
                    </div>
                    {/* Avg WiFi RSSI */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="All-time average WiFi RSSI among all ESP32 devices"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-blue-300 select-none" style={{ fontSize: "3.5rem" }}>
                                wifi
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-xl font-bold text-white leading-none mb-1">{avg_wifi_rssi} dBm</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Average WiFi RSSI</span>
                        </div>
                    </div>
                    {/* Avg CPU Temp */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="All-time average CPU temperature among all ESP32 devices"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-orange-300 select-none" style={{ fontSize: "4rem" }}>
                                thermometer
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-xl font-bold text-white leading-none mb-1">{avg_cpu_temp.toFixed(1)}°C</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Average CPU temperature</span>
                        </div>
                    </div>
                </div>
                {/* Second row: Down, Longest Downtime, Power, Latest Firmware (each 1/4) */}
                <div className="flex w-full gap-x-6">
                    {/* Down devices */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Number of devices currently not powered nor connected to WiFi"
                    >
                        <div className="relative flex-shrink-0 flex items-center justify-center ml-4 mr-9" style={{ width: 28, height: 28 }}>
                            <span className={"absolute w-15 h-15 rounded-full bg-red-400/20"} aria-hidden="true" />
                            <span className={"w-5 h-5 rounded-full bg-red-400"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-3xl font-bold text-white leading-none">{status_counts.Offline}</span>
                            )}
                            <span className="text-base text-gray-300 mt-1">Down devices</span>
                        </div>
                    </div>
                    {/* Longest downtime */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Device with the longest downtime (since last boot)"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-red-400 select-none" style={{ fontSize: "4rem" }}>
                                power_off
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : longest_downtime_device ? (
                                <span className="font-bold leading-none">
                                    <span className="text-white text-xl align-middle">{longest_downtime_device.device_id}: </span>
                                    <span className="text-red-300 text-xl align-middle">{format_timestamp(longest_downtime_device.last_updated)}</span>
                                </span>
                            ) : (
                                <span className="text-base text-gray-400">-</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Longest downtime</span>
                        </div>
                    </div>
                    {/* Power consumption (1/4 width) */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Estimated daily power consumption of all ESP32 devices"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-yellow-400 select-none" style={{ fontSize: "4rem" }}>
                                energy_savings_leaf
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-xl font-bold text-white leading-none mb-1">{daily_kwh_display} kWh</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Daily power consumption</span>
                        </div>
                    </div>
                    {/* Latest firmware version (1/4 width) */}
                    <div
                        className="flex-1 flex items-center bg-slate-800 rounded-lg p-5 min-w-0 border border-gray-700"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Latest firmware version released"
                    >
                        <div className="flex-shrink-0 flex items-center justify-center ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-rounded text-purple-300 select-none" style={{ fontSize: "4rem" }}>
                                memory
                            </span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            {loading ? (
                                <span className="block h-6 w-24 bg-gray-700 rounded-lg animate-pulse mb-1" />
                            ) : (
                                <span className="text-xl font-bold text-white leading-none mb-1">{latest_firmware_version}</span>
                            )}
                            <span className="text-base text-gray-300 mt-1 whitespace-nowrap">Latest version</span>
                        </div>
                    </div>
                </div>
                {/* Fourth row: global uptime (bigger), big panel */}
                <div className="flex w-full gap-x-6 mb-16">
                    {/* Global average uptime progress circle (square, bigger, tooltip) */}
                    <div className="flex flex-col items-center justify-center bg-slate-800 rounded-xl min-w-0 border border-gray-700" style={{ flexBasis: '0 0 320px', width: 320, height: 320, aspectRatio: '1/1', padding: '0' }}>
                        <span
                            data-tooltip-id="main-tooltip"
                            data-tooltip-content="All-time average uptime among all ESP32 devices"
                            className="w-full h-full flex flex-col items-center justify-center"
                        >
                            <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                                {/* SVG progress circle */}
                                <svg width="220" height="220" viewBox="0 0 220 220">
                                    <circle
                                        cx="110" cy="110" r="100"
                                        stroke="#334155"
                                        strokeWidth="18"
                                        fill="none"
                                        className={loading ? 'animate-pulse' : ''}
                                    />
                                    <circle
                                        cx="110" cy="110" r="100"
                                        stroke={global_uptime_percent >= 80 ? '#22c55e' : global_uptime_percent >= 50 ? '#facc15' : '#ef4444'}
                                        strokeWidth="18"
                                        fill="none"
                                        strokeDasharray={2 * Math.PI * 100}
                                        strokeDashoffset={2 * Math.PI * 100 * (1 - (loading ? 0 : displayedUptime) / 100)}
                                        strokeLinecap="round"
                                        // No transition: JS animation handles smoothness
                                    />
                                    <text x="50%" y="50%" textAnchor="middle" dy=".3em" fontSize="2.7rem" fill="#fff" fontWeight="bold">
                                        {loading ? '' : displayedUptime.toFixed(1) + '%'}
                                    </text>
                                </svg>
                                {loading && (
                                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block h-10 w-30 bg-gray-700 rounded-lg animate-pulse" style={{ zIndex: 2 }} />
                                )}
                            </div>
                            <span className="text-lg text-gray-300 mt-6">Average uptime</span>
                        </span>
                    </div>
                    {/* Big panel (2/3) */}
                    <div
                        className="flex flex-col bg-slate-800 rounded-xl min-h-[320px] mb-0 flex-1 border border-gray-700 justify-center items-center"
                        style={{ flexBasis: 'auto' }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Uptime history (COMING SOON)"
                    >
                        {/* Empty panel for future content */}
                    </div>
                </div>
                
                {/* Devices title and controls */}
                <div className="w-full flex justify-between items-center gap-4">
                    <h1 className="text-5xl font-bold text-white h-11 flex items-center">
                        Device list
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center" style={{ minWidth: 140, maxWidth: 220 }}>
                            <span className="material-symbols-rounded absolute left-3 text-gray-500 select-none">
                                search
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Search by device ID"
                                className="h-11 pl-10 pr-3 py-2 rounded-xl bg-slate-900 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700"
                                value={search}
                                onChange={e => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    set_search(val);
                                }}
                                style={{ minWidth: 140, maxWidth: 220 }}
                            />
                        </div>
                        <div className="relative flex items-center" style={{ minWidth: 180 }}>
                            <span className="material-symbols-rounded absolute left-3 text-gray-500 select-none pointer-events-none">
                                sort
                            </span>
                            <select
                                className="h-11 pl-10 pr-8 py-2 rounded-xl bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700 appearance-none cursor-pointer"
                                value={sort_by}
                                onChange={e => set_sort_by(e.target.value as any)}
                                style={{ minWidth: 180, backgroundPosition: 'right 1.5rem center' }}
                            >
                                <option value="device_id">Sort by device ID</option>
                                <option value="uptime">Sort by uptime</option>
                                <option value="firmware_version">Sort by firmware version</option>
                                <option value="cpu_temperature">Sort by temperature</option>
                                <option value="wifi_rssi">Sort by WiFi strength</option>
                            </select>
                        </div>
                        <div className="relative flex items-center" style={{ minWidth: 150 }}>
                            <span className="material-symbols-rounded absolute left-3 text-gray-500 select-none pointer-events-none">
                                swap_vert
                            </span>
                            <select
                                className="h-11 pl-10 pr-8 py-2 rounded-xl bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700 appearance-none cursor-pointer"
                                value={sort_order}
                                onChange={e => set_sort_order(e.target.value as 'ascending' | 'descending')}
                                style={{ minWidth: 150, backgroundPosition: 'right 1.5rem center' }}
                            >
                                <option value="ascending">{sort_order_labels.ascending}</option>
                                <option value="descending">{sort_order_labels.descending}</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-3 text-gray-300 text-base cursor-pointer select-none">
                            <span>Show online first</span>
                            <span className="relative inline-block w-11 h-6 align-middle select-none">
                                <input
                                    type="checkbox"
                                    checked={online_first}
                                    onChange={e => set_online_first(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <span className="block bg-slate-700 peer-checked:bg-blue-500 w-11 h-6 rounded-full transition-colors duration-200"></span>
                                <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-200 peer-checked:translate-x-5"></span>
                            </span>
                        </label>
                    </div>
                </div>
                {/* Device list */}
                <div className="w-full flex flex-col overflow-hidden rounded-xl border border-gray-700">
                    {loading ? (
                        <div className="w-full flex flex-col items-center justify-center py-20">
                            <span className="material-symbols-rounded animate-spin text-5xl text-blue-500 mb-4">
                                progress_activity
                            </span>
                            <span className="text-gray-300 text-xl font-medium">Loading devices…</span>
                        </div>
                    ) : sorted_devices.length === 0 ? (
                        <div className="w-full flex justify-center py-10 text-gray-400 items-center">
                            <span className="material-symbols-rounded align-middle text-2xl mr-2 select-none">
                                sentiment_dissatisfied
                            </span>
                            No results.
                        </div>
                    ) : (
                        sorted_devices.map((device, idx) => {
                            const device_status = get_device_status(device);
                            const is_device_broadcasting = device_status === "Broadcasting";
                            const is_device_offline = device_status === "Offline";
                            const status_color = is_device_broadcasting ? "text-green-400" : "text-red-400";
                            const circle_color = is_device_broadcasting ? "bg-green-400" : "bg-red-400";
                            const circle_bg_color = is_device_broadcasting ? "bg-green-400/20" : "bg-red-400/20";
                            const status_text = is_device_broadcasting ? "Up" : "Down";
                            const status_date = is_device_broadcasting
                                ? format_timestamp(device.booted)
                                : format_timestamp(
                                    device.last_updated
                                        ? new Date(new Date(device.last_updated).getTime() + (parseInt(device.update_interval) * 1000))
                                        : null
                                );
                            const interval_text = device.update_interval == null ? "-" : format_interval(device.update_interval);
                            const temp_text = is_device_offline ? "-" : check_null(device.cpu_temperature, "°C");

                            return (
                                <div
                                    key={device.device_id}
                                    className={
                                        "flex items-center w-full bg-slate-800 px-6 py-4 shadow-sm" +
                                        (idx !== sorted_devices.length - 1 ? " border-b border-gray-700" : "")
                                    }
                                    style={{ marginTop: 0, marginBottom: 0 }}
                                >
                                    {/* Status circle with glow effect */}
                                    <div className="relative flex-shrink-0 flex items-center justify-center mr-4" style={{ width: 40, height: 40 }}>
                                        <span
                                            className={`absolute w-12 h-12 rounded-full ${circle_bg_color}`}
                                            aria-hidden="true"
                                        />
                                        <span
                                            className={`w-4 h-4 rounded-full ${circle_color}`}
                                            aria-hidden="true"
                                        />
                                    </div>
                                    {/* Device info */}
                                    <div className="flex flex-col flex-grow min-w-0 w-[120px] justify-center">
                                        <span
                                            className="text-white font-normal truncate leading-tight"
                                            style={{ fontSize: "22px" }}
                                        >
                                            {device.device_id ?? "-"}
                                        </span>
                                        <span className="flex items-center gap-2 mt-0.5 mb-0.5" style={{ fontSize: "16px" }}>
                                            <span className={`${status_color} font-medium`}>{status_text}</span>
                                            <span
                                                className="select-none"
                                                style={{
                                                    fontSize: "0.4em",
                                                    color: "#9ca3af",
                                                    display: "inline-block",
                                                    verticalAlign: "middle",
                                                    position: "relative",
                                                    top: "1px",
                                                }}
                                            >
                                                ●
                                            </span>
                                            <span className="text-gray-400">{status_date ?? "-"}</span>
                                        </span>
                                    </div>
                                    {/* Metrics grid*/}
                                    <div className="grid grid-cols-5 gap-16 min-w-[580px] items-center flex-grow">
                                        {/* RSSI */}
                                        <div
                                            className="flex items-center gap-3 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="WiFi signal strength (RSSI)"
                                        >
                                            {/* Only show faded wifi icon if not offline */}
                                            {!is_device_offline && (
                                                <span className="material-symbols-rounded text-gray-400/30 text-xl select-none flex-shrink-0 w-6 text-center absolute">
                                                    wifi
                                                </span>
                                            )}
                                            {/* Overlay the colored/active wifi icon */}
                                            <span className="material-symbols-rounded text-gray-400 text-xl select-none flex-shrink-0 w-6 text-center relative">
                                                {is_device_offline
                                                    ? "wifi_off"
                                                    : Number(device.wifi_rssi) >= -55
                                                        ? "wifi"
                                                        : Number(device.wifi_rssi) > -75
                                                            ? "wifi_2_bar"
                                                            : "wifi_1_bar"}
                                            </span>
                                            <span className="text-gray-400 text-base">
                                                {is_device_offline ? "-" : check_null(device.wifi_rssi, " dBm")}
                                            </span>
                                        </div>
                                        {/* CPU temperature */}
                                        <div
                                            className="flex items-center gap-1 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="CPU Temperature"
                                        >
                                            <span
                                                className={
                                                    "material-symbols-rounded text-xl select-none flex-shrink-0 w-6 text-center " +
                                                    (
                                                        temp_text === "-" 
                                                            ? "text-gray-400"
                                                            : Number(device.cpu_temperature) >= 55 || Number(device.cpu_temperature) <= 15
                                                                ? "text-red-400"
                                                                : "text-gray-400"
                                                    )
                                                }
                                            >
                                                thermometer
                                            </span>
                                            <span
                                                className={
                                                    "text-base " +
                                                    (
                                                        temp_text === "-" 
                                                            ? "text-gray-400"
                                                            : Number(device.cpu_temperature) >= 55 || Number(device.cpu_temperature) <= 10
                                                                ? "text-red-400"
                                                                : "text-gray-400"
                                                    )
                                                }
                                            >
                                                {temp_text}
                                            </span>
                                        </div>
                                        {/* Last updated */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="The last time this device sent a status update"
                                        >
                                            <span className="material-symbols-rounded text-gray-400 text-xl select-none flex-shrink-0 w-6 text-center">
                                                schedule
                                            </span>
                                            <span className="text-gray-400 text-base text-left w-full block">
                                                {device.last_updated ? format_timestamp(device.last_updated) + " ago" : "-"}
                                            </span>
                                        </div>
                                        {/* Update interval */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="How often this device is configured to send status updates"
                                        >
                                            <span className="material-symbols-rounded text-gray-400 text-xl select-none flex-shrink-0 w-6 text-center">
                                                update
                                            </span>
                                            <span className="text-gray-400 text-base text-left w-full block">
                                                {interval_text}
                                            </span>
                                        </div>
                                        {/* Firmware version */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="The current firmware version running on this device"
                                        >
                                            <span className="material-symbols-rounded text-gray-400 text-xl select-none flex-shrink-0 w-6 text-center">
                                                memory
                                            </span>
                                            <span className="text-gray-400 text-base text-left w-full block">
                                                {device.firmware_version ?? "-"}
                                            </span>
                                        </div>
                                    </div>
                                    {/* More button at the far right */}
                                    <div className="flex items-center justify-center h-full w-10 ml-4">
                                        <button
                                            type="button"
                                            className="rounded-full hover:bg-slate-700 w-10 h-10 flex items-center justify-center transition cursor-pointer"
                                            onClick={() => {/* set some modal state here, e.g. set_selected_device(device) */}}
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="Show more details (COMING SOON)"
                                        >
                                            <span className="material-symbols-rounded text-gray-400 text-2xl select-none">
                                                more_horiz
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <Tooltip
                id="main-tooltip"
                place="top"
                style={{
                    backgroundColor: "#23293a",
                    color: "#e5e7eb",
                    borderRadius: "12px",
                    fontSize: "14px",
                    padding: "8px 14px",
                    boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)",
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                    zIndex: 50,
                    whiteSpace: "pre-line",
                    maxWidth: "220px",
                }}
                delayShow={300}
            />
        </div>
    );
}
