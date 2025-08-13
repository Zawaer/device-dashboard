"use client";

import Image from "next/image";
import { createClient } from '@supabase/supabase-js'



export default function Home() {
	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-950">
			<div className="min-w-150 overflow-hidden rounded-md border border-gray-700">
				<table className="w-full max-w-4xl text-left border-collapse">
					<thead className="bg-gray-900 border-b border-gray-700">
						<tr>
							<th className="px-4 py-2 text-gray-200">Status</th>
							<th className="px-4 py-2 text-gray-200">Room</th>
							<th className="px-4 py-2 text-gray-200">Last seen</th>
						</tr>
					</thead>
					<tbody className="bg-gray-800 divide-y divide-gray-700">
						<tr>
							<td className="px-4 py-2 text-emerald-400 flex items-center gap-2">
								<span className="material-symbols-outlined">sensors</span>
								Broadcasting
							</td>
							<td className="px-4 py-2 text-gray-500">1315</td>
							<td className="px-4 py-2 text-gray-500">48m ago</td>
						</tr>
						<tr>
							<td className="px-4 py-2 text-orange-400 flex items-center gap-2">
								<span className="material-symbols-outlined">sensors_off</span>
								Idle
							</td>
							<td className="px-4 py-2 text-gray-500">2408</td>
							<td className="px-4 py-2 text-gray-500">31m ago</td>
						</tr>
						<tr>
							<td className="px-4 py-2 text-red-400 flex items-center gap-2">
								<span className="material-symbols-outlined">exclamation</span>
								Offline
							</td>
							<td className="px-4 py-2 text-gray-500">3227</td>
							<td className="px-4 py-2 text-gray-500">1h 38m ago</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}
