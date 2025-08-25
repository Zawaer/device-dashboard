"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Tooltip } from "react-tooltip";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// helper for dynamic sort order labels
function get_sort_order_labels(sort_by: "device_id" | "status" | "uptime") {
    switch (sort_by) {
        case "uptime":
            return { ascending: "Low to high", descending: "High to low" };
        case "device_id":
            return { ascending: "Low to high", descending: "High to low" };
        case "status":
            return { ascending: "Online first", descending: "Offline first" };
        default:
            return { ascending: "Ascending", descending: "Descending" };
    }
}

export default function Home() {
    const [devices, set_devices] = useState<any[]>([]);
    const [loading, set_loading] = useState(true);

    const [search, set_search] = useState("");
    const [sort_by, set_sort_by] = useState<"device_id" | "status" | "uptime">("device_id");
    const [sort_order, set_sort_order] = useState<"ascending" | "descending">("ascending");

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
        };

        fetch_data();
    }, []);

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
    const sorted_devices = [...filtered_devices].sort((a, b) => {
        let result = 0;
        if (sort_by === "status") {
            const status_order: Record<"Broadcasting" | "Offline", number> = {
                Broadcasting: 0,
                Offline: 1,
            };
            const status_a = get_device_status(a) as "Broadcasting" | "Offline";
            const status_b = get_device_status(b) as "Broadcasting" | "Offline";
            result = status_order[status_a] - status_order[status_b];
        } else if (sort_by === "device_id") {
            const id_a = a.device_id ?? "";
            const id_b = b.device_id ?? "";
            result = id_a.localeCompare(id_b, undefined, { numeric: true });
        } else if (sort_by === "uptime") {
            const status_a = get_device_status(a);
            const status_b = get_device_status(b);

            // Always put offline devices at the end
            if (status_a === "Offline" && status_b !== "Offline") return 1;
            if (status_a !== "Offline" && status_b === "Offline") return -1;

            // Both online: sort by uptime (booted)
            if (status_a !== "Offline" && status_b !== "Offline") {
                const up_a = a.booted ? Date.now() - new Date(a.booted).getTime() : 0;
                const up_b = b.booted ? Date.now() - new Date(b.booted).getTime() : 0;
                result = up_a - up_b; // Descending: longest uptime first
            }
            // Both offline: sort by downtime (last_updated + update_interval)
            else if (status_a === "Offline" && status_b === "Offline") {
                const down_a = a.last_updated
                    ? Date.now() - (new Date(a.last_updated).getTime() + parseInt(a.update_interval) * 1000)
                    : 0;
                const down_b = b.last_updated
                    ? Date.now() - (new Date(b.last_updated).getTime() + parseInt(b.update_interval) * 1000)
                    : 0;
                result = down_a - down_b; // Descending: longest downtime first
            }
        }
        return sort_order === "ascending" ? result : -result;
    });

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

    return (
        <div className="flex flex-col min-h-screen bg-slate-900">
            <div className="flex flex-col m-[80px] gap-10 overflow-x-auto justify-start items-start ">
                {/* Status count boxes at the very top */}
                <div className="flex w-full gap-x-10 mb-20">
                    {/* Up devices */}
                    <div className="flex items-center bg-slate-800 rounded-lg p-6 flex-1 min-w-0">
                        {/* Status circle with glow effect */}
                        <div className="relative flex-shrink-0 flex items-center justify-center mr-12 ml-8" style={{ width: 40, height: 40 }}>
                            <span className={"absolute w-24 h-24 rounded-full bg-green-400/20"} aria-hidden="true" />
                            <span className={"w-8 h-8 rounded-full bg-green-400"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            <span className="text-6xl font-bold text-white leading-none">{status_counts.Broadcasting}</span>
                            <span className="text-lg text-gray-300 mt-2">Up devices</span>
                        </div>
                    </div>
                    {/* Down devices */}
                    <div className="flex items-center bg-slate-800 rounded-lg p-6 flex-1 min-w-0">
                        {/* Status circle with glow effect */}
                        <div className="relative flex-shrink-0 flex items-center justify-center mr-12 ml-8" style={{ width: 40, height: 40 }}>
                            <span className={"absolute w-24 h-24 rounded-full bg-red-400/20"} aria-hidden="true" />
                            <span className={"w-8 h-8 rounded-full bg-red-400"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            <span className="text-6xl font-bold text-white leading-none">{status_counts.Offline}</span>
                            <span className="text-lg text-gray-300 mt-2">Down devices</span>
                        </div>
                    </div>
                    {/* Energy usage */}
                    <div className="flex items-center bg-slate-800 rounded-lg p-6 flex-1 min-w-0">
                        <div className="flex-shrink-0 flex items-center justify-center mr-12 ml-8" style={{ width: 40, height: 40 }}>
                            <span className="material-symbols-rounded text-green-400 text-5xl select-none">energy_savings_leaf</span>
                        </div>
                        <div className="flex flex-col flex-1 justify-center items-start">
                            <span className="text-6xl font-bold text-white leading-none">-</span>
                            <span className="text-lg text-gray-300 mt-2">Total usage</span>
                        </div>
                    </div>
                </div>
                {/* Big panel below the boxes */}
                <div className="w-full bg-slate-800 rounded-2xl min-h-[220px] mb-12 flex items-center justify-center text-2xl text-gray-400">
                    {/* Empty panel for future content */}
                </div>
                {/* Devices title and controls */}
                <div className="w-full flex justify-between items-center gap-4">
                    <h1 className="text-5xl font-bold text-white h-11 flex items-center">
                        Devices
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center" style={{ minWidth: 180 }}>
                            <span className="material-symbols-rounded absolute left-3 text-gray-500  select-none">
                                search
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Search by device ID"
                                className="h-11 pl-10 pr-4 py-2 rounded-md bg-slate-900 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700"
                                value={search}
                                onChange={e => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    set_search(val);
                                }}
                                style={{ minWidth: 180 }}
                            />
                        </div>
                        <select
                            className="h-11 px-4 py-2 pr-8 rounded-md bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700"
                            value={sort_by}
                            onChange={e => set_sort_by(e.target.value as "device_id" | "status" | "uptime")}
                            style={{ minWidth: 180, backgroundPosition: 'right 1.5rem center' }}
                        >
                            <option value="device_id">Sort by device ID</option>
                            <option value="status">Sort by status</option>
                            <option value="uptime">Sort by uptime</option>
                        </select>
                        <select
                            className="h-11 px-4 py-2 pr-8 rounded-md bg-slate-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none border border-gray-700"
                            value={sort_order}
                            onChange={e => set_sort_order(e.target.value as "ascending" | "descending")}
                            style={{ minWidth: 150, backgroundPosition: 'right 1.5rem center' }}
                        >
                            <option value="ascending">{sort_order_labels.ascending}</option>
                            <option value="descending">{sort_order_labels.descending}</option>
                        </select>
                    </div>
                </div>
                {/* Device list */}
                <div className="w-full flex flex-col overflow-hidden rounded-2xl border border-gray-700">
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
                                    <div className="flex flex-col flex-grow min-w-0 justify-center">
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
                                                    top: "2px",
                                                }}
                                            >
                                                ●
                                            </span>
                                            <span className="text-gray-400">{status_date ?? "-"}</span>
                                        </span>
                                    </div>
                                    {/* Metrics grid*/}
                                    <div className="grid grid-cols-6 gap-15 ml-auto min-w-[680px] items-center">
										{/* RSSI */}
										<div
											className="flex items-center gap-3 w-[100px]"
											data-tooltip-id="main-tooltip"
											data-tooltip-content="WiFi signal strength"
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
										{/* More button */}
										<div className="flex items-center justify-center h-full w-[100px]">
											<button
												type="button"
												className="rounded-full hover:bg-slate-700 w-10 h-10 flex items-center justify-center transition"
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
					borderRadius: "8px",
					fontSize: "14px",
					padding: "8px 14px",
					boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)",
					fontWeight: 500,
					letterSpacing: "0.01em",
					zIndex: 50,
					whiteSpace: "pre-line", // allow wrapping and line breaks
					maxWidth: "220px", // optional: limit width for better readability
				}}
				delayShow={300}
			/>
        </div>
    );
}
