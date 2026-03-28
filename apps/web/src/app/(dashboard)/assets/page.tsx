"use client";

import { useState } from "react";
import { AssetModelViewer } from "@/components/asset-model-viewer";
import { ChevronRight } from "lucide-react";

// ── Mock telemetry data ─────────────────────────────────────────────────────

interface AssetTelemetry {
  asset_id: string;
  callsign: string;
  asset_type: string;
  asset_class: "Military" | "Infrastructure" | "Logistics";
  model_path: string | null;
  embed_url?: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  speed_kmh: number;
  status: string;
  sensor_type: string | null;
  mgrs: string;
}

const MOCK_ASSETS: AssetTelemetry[] = [
  // ── Drones ──
  {
    asset_id: "a1",
    callsign: "REAPER-01",
    asset_type: "MQ-9 Reaper",
    asset_class: "Military",
    model_path: "/models/mq-9.glb",
    latitude: 34.4215,
    longitude: 40.8732,
    altitude_m: 7580,
    heading_deg: 10.84,
    pitch_deg: 2.9,
    roll_deg: -17.54,
    speed_kmh: 370,
    status: "ACTIVE",
    sensor_type: "FLIR SS380-HD HDEO",
    mgrs: "38SLH 44500 60867",
  },
  {
    asset_id: "a2",
    callsign: "VIPER-03",
    asset_type: "MQ-9 Reaper",
    asset_class: "Military",
    model_path: "/models/mq-9.glb",
    latitude: 35.1102,
    longitude: 41.2290,
    altitude_m: 6200,
    heading_deg: 245.3,
    pitch_deg: -1.2,
    roll_deg: 5.8,
    speed_kmh: 310,
    status: "ACTIVE",
    sensor_type: "MTS-B EO/IR",
    mgrs: "38SMH 11200 44100",
  },
  // ── Fighter Jets ──
  {
    asset_id: "a5",
    callsign: "FALCON-01",
    asset_type: "F-16C Fighting Falcon",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/f0b00989e5634764848ef2c235c64db5/embed",
    latitude: 34.8500,
    longitude: 41.5200,
    altitude_m: 9150,
    heading_deg: 135.2,
    pitch_deg: 3.8,
    roll_deg: -8.1,
    speed_kmh: 780,
    status: "ACTIVE",
    sensor_type: "AN/APG-68 Radar",
    mgrs: "38SLH 52100 57200",
  },
  {
    asset_id: "a6",
    callsign: "LIGHTNING-02",
    asset_type: "F-35B Lightning II",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/b1ab1c0090e34b0fbfe667e706023e6d/embed",
    latitude: 35.2300,
    longitude: 40.3400,
    altitude_m: 12200,
    heading_deg: 22.7,
    pitch_deg: -1.5,
    roll_deg: 4.2,
    speed_kmh: 920,
    status: "ACTIVE",
    sensor_type: "AN/APG-81 AESA",
    mgrs: "38SMH 08500 41300",
  },
  {
    asset_id: "a7",
    callsign: "STRIKE-04",
    asset_type: "F-16C Fighting Falcon",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/f0b00989e5634764848ef2c235c64db5/embed",
    latitude: 33.9500,
    longitude: 42.1800,
    altitude_m: 7800,
    heading_deg: 290.5,
    pitch_deg: 0.8,
    roll_deg: -15.3,
    speed_kmh: 650,
    status: "RTB",
    sensor_type: "AN/APG-68 Radar",
    mgrs: "38SLJ 48100 60500",
  },
  // ── Armor ──
  {
    asset_id: "a8",
    callsign: "THUNDER-11",
    asset_type: "M1A2 Abrams",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/2577a4eccbc74b2da6dba5bfd09b7511/embed",
    latitude: 34.2100,
    longitude: 40.6500,
    altitude_m: 340,
    heading_deg: 178.4,
    pitch_deg: -2.1,
    roll_deg: 1.5,
    speed_kmh: 45,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLH 43200 62100",
  },
  {
    asset_id: "a9",
    callsign: "HAMMER-06",
    asset_type: "M1A2 Abrams",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/2577a4eccbc74b2da6dba5bfd09b7511/embed",
    latitude: 34.3800,
    longitude: 40.9100,
    altitude_m: 285,
    heading_deg: 55.9,
    pitch_deg: 3.2,
    roll_deg: -0.8,
    speed_kmh: 38,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLH 45600 59800",
  },
  {
    asset_id: "a10",
    callsign: "IRON-09",
    asset_type: "M1A2 Abrams",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/2577a4eccbc74b2da6dba5bfd09b7511/embed",
    latitude: 34.0500,
    longitude: 41.3200,
    altitude_m: 410,
    heading_deg: 310.0,
    pitch_deg: -4.8,
    roll_deg: 2.1,
    speed_kmh: 0,
    status: "HOLDING",
    sensor_type: null,
    mgrs: "38SLH 49800 56200",
  },
  // ── Helicopters (local GLB) ──
  {
    asset_id: "a11",
    callsign: "APACHE-02",
    asset_type: "AH-64 Apache",
    asset_class: "Military",
    model_path: "/models/ah-64_apache.glb",
    latitude: 34.6300,
    longitude: 40.4500,
    altitude_m: 1200,
    heading_deg: 195.6,
    pitch_deg: -5.2,
    roll_deg: 3.8,
    speed_kmh: 260,
    status: "ACTIVE",
    sensor_type: "TADS/PNVS",
    mgrs: "38SLH 41200 63500",
  },
  {
    asset_id: "a12",
    callsign: "DUSTOFF-09",
    asset_type: "CH-47 Chinook",
    asset_class: "Logistics",
    model_path: "/models/boeing_ch-47_chinook_military_transport_aircraft.glb",
    latitude: 34.9100,
    longitude: 41.8800,
    altitude_m: 2400,
    heading_deg: 48.3,
    pitch_deg: 1.5,
    roll_deg: -2.0,
    speed_kmh: 220,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SMH 10800 42500",
  },
  // ── Ground Vehicles (local GLB) ──
  {
    asset_id: "a13",
    callsign: "WARHOG-03",
    asset_type: "Humvee",
    asset_class: "Logistics",
    model_path: "/models/humvee_transport.glb",
    latitude: 34.2800,
    longitude: 40.5900,
    altitude_m: 310,
    heading_deg: 88.2,
    pitch_deg: 0,
    roll_deg: 0,
    speed_kmh: 72,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLH 43800 61800",
  },
  {
    asset_id: "a14",
    callsign: "BADGER-07",
    asset_type: "BTR-82 APC",
    asset_class: "Military",
    model_path: "/models/low_poly_btr_82.glb",
    latitude: 34.1200,
    longitude: 41.1500,
    altitude_m: 360,
    heading_deg: 222.0,
    pitch_deg: -1.8,
    roll_deg: 0.5,
    speed_kmh: 55,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLH 47200 58900",
  },
  {
    asset_id: "a15",
    callsign: "BULLDOG-01",
    asset_type: "M2 Bradley IFV",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/ab022158ab5f4fbfa55d4142db7595ab/embed",
    latitude: 34.3200,
    longitude: 40.7100,
    altitude_m: 290,
    heading_deg: 162.4,
    pitch_deg: 0,
    roll_deg: -0.5,
    speed_kmh: 48,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLH 44100 62300",
  },
  // ── Cargo / Transport (local GLB) ──
  {
    asset_id: "a16",
    callsign: "SPOOKY-01",
    asset_type: "AC-130 Hercules",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/361991c9874d4680931b3e0d23500e43/embed",
    latitude: 35.0200,
    longitude: 41.4500,
    altitude_m: 5500,
    heading_deg: 305.8,
    pitch_deg: 2.1,
    roll_deg: -22.5,
    speed_kmh: 480,
    status: "LOITER",
    sensor_type: "AN/AAQ-26 FLIR",
    mgrs: "38SMH 09500 43200",
  },
  // ── Naval (local GLB + Sketchfab embeds) ──
  {
    asset_id: "a17",
    callsign: "DDG-72",
    asset_type: "USS Arleigh Burke",
    asset_class: "Military",
    model_path: "/models/11_low_poly_us_navy_ddg-51_uss_arleigh_burke..glb",
    latitude: 33.4500,
    longitude: 43.8200,
    altitude_m: 0,
    heading_deg: 315.0,
    pitch_deg: 0,
    roll_deg: -1.2,
    speed_kmh: 56,
    status: "ACTIVE",
    sensor_type: "AN/SPY-1D Radar",
    mgrs: "38SLJ 48900 54200",
  },
  {
    asset_id: "a18",
    callsign: "TRIDENT-05",
    asset_type: "Inflatable Patrol Boat",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/a4d64d7465c64258b50e3764fa92f020/embed",
    latitude: 33.6200,
    longitude: 43.2100,
    altitude_m: 0,
    heading_deg: 72.5,
    pitch_deg: 0,
    roll_deg: -1.3,
    speed_kmh: 55,
    status: "ACTIVE",
    sensor_type: null,
    mgrs: "38SLJ 46200 55800",
  },
  {
    asset_id: "a19",
    callsign: "CVN-QE",
    asset_type: "HMS Queen Elizabeth Carrier",
    asset_class: "Military",
    model_path: null,
    embed_url: "https://sketchfab.com/models/cdac73e931f6482e86960a326fef73bf/embed",
    latitude: 33.2800,
    longitude: 44.1000,
    altitude_m: 0,
    heading_deg: 280.0,
    pitch_deg: 0,
    roll_deg: 0.8,
    speed_kmh: 46,
    status: "ACTIVE",
    sensor_type: "Artisan 3D Radar",
    mgrs: "38SLJ 50100 53800",
  },
  // ── Infrastructure (Sketchfab embed + local GLB) ──
  {
    asset_id: "a20",
    callsign: "FOB ALPHA",
    asset_type: "Forward Operating Base",
    asset_class: "Infrastructure",
    model_path: null,
    embed_url: "https://sketchfab.com/models/232c11dc315d467db6b1a4102c42792a/embed",
    latitude: 34.5600,
    longitude: 41.0400,
    altitude_m: 395,
    heading_deg: 0,
    pitch_deg: 0,
    roll_deg: 0,
    speed_kmh: 0,
    status: "OPERATIONAL",
    sensor_type: null,
    mgrs: "38SLH 46100 60200",
  },
  {
    asset_id: "a21",
    callsign: "OILFIELD-3",
    asset_type: "Oil Pump Jack",
    asset_class: "Infrastructure",
    model_path: "/models/oil_pump_jack.glb",
    latitude: 34.7200,
    longitude: 42.3500,
    altitude_m: 280,
    heading_deg: 0,
    pitch_deg: 0,
    roll_deg: 0,
    speed_kmh: 0,
    status: "OPERATIONAL",
    sensor_type: null,
    mgrs: "38SLJ 51200 57600",
  },
  // ── Weapons / Equipment (local GLB + Sketchfab embed) ──
  {
    asset_id: "a22",
    callsign: "M4A1-REF",
    asset_type: "M4A1 Carbine",
    asset_class: "Logistics",
    model_path: null,
    embed_url: "https://sketchfab.com/models/33107f38b23c45cc8103768c0e961cdf/embed",
    latitude: 34.5600,
    longitude: 41.0400,
    altitude_m: 395,
    heading_deg: 0,
    pitch_deg: 0,
    roll_deg: 0,
    speed_kmh: 0,
    status: "STORED",
    sensor_type: null,
    mgrs: "38SLH 46100 60200",
  },
  {
    asset_id: "a23",
    callsign: "5.56 NATO FMJ",
    asset_type: "5.56x45mm NATO Cartridge",
    asset_class: "Logistics",
    model_path: null,
    embed_url: "https://sketchfab.com/models/f740287755c545c6af3473a0ddb9b137/embed",
    latitude: 34.5600,
    longitude: 41.0400,
    altitude_m: 395,
    heading_deg: 0,
    pitch_deg: 0,
    roll_deg: 0,
    speed_kmh: 0,
    status: "STORED",
    sensor_type: null,
    mgrs: "38SLH 46100 60200",
  },
  // ── Drones (Sketchfab embed) ──
  { asset_id: "a24", callsign: "HIVE-03", asset_type: "Hovering Recon Drone", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/eac2b4bc20f54b3ba8c3ddbcdf03c8d6/embed", latitude: 34.3500, longitude: 40.8200, altitude_m: 150, heading_deg: 210.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 35, status: "ACTIVE", sensor_type: "EO/IR Gimbal", mgrs: "38SLH 44800 61200" },
  // ── Infantry (Sketchfab embed) ──
  { asset_id: "a25", callsign: "BRAVO-2-1", asset_type: "Infantry Squad", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/22ddacc2fa6b4f67b975169c548dbd70/embed", latitude: 34.1950, longitude: 40.7800, altitude_m: 320, heading_deg: 145.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 5, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 42800 61500" },
  // ── Air Defense / SAM Systems (Sketchfab embeds) ──
  { asset_id: "a26", callsign: "GROWLER-01", asset_type: "S-400 Triumf SAM", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/1a109bdd906149249dce0a18cdfbe708/embed", latitude: 35.4200, longitude: 40.1500, altitude_m: 410, heading_deg: 0.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: "91N6E Radar", mgrs: "37SFV 88200 22400" },
  { asset_id: "a27", callsign: "PATRIOT-01", asset_type: "MIM-104 Patriot", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/2e1160a3f61b44f29859269b5312c834/embed", latitude: 34.7300, longitude: 41.0800, altitude_m: 285, heading_deg: 315.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: "AN/MPQ-53 Radar", mgrs: "38SLH 49100 62300" },
  { asset_id: "a28", callsign: "IRON-DOME-02", asset_type: "Iron Dome Defense System", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/4c9aab0f3c014274b921e0a8c3638eee/embed", latitude: 34.5100, longitude: 40.9200, altitude_m: 195, heading_deg: 90.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: "EL/M-2084 Radar", mgrs: "38SLH 46300 60100" },
  // ── ISR / Intelligence Assets (Sketchfab embeds) ──
  { asset_id: "a29", callsign: "HAWKEYE-01", asset_type: "RQ-4 Global Hawk", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/dd87adcff26b46e58639e9256f5301c4/embed", latitude: 36.1200, longitude: 40.5500, altitude_m: 18200, heading_deg: 270.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 575, status: "ACTIVE", sensor_type: "EISS / MP-RTIP Radar", mgrs: "37SFV 92100 30500" },
  { asset_id: "a30", callsign: "SENTRY-01", asset_type: "E-3A AWACS", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/80164b1137494e468212730872738e12/embed", latitude: 36.5000, longitude: 41.2000, altitude_m: 9100, heading_deg: 180.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 720, status: "ACTIVE", sensor_type: "AN/APY-2 Radar", mgrs: "38SMH 09200 48300" },
  // ── Artillery / Fire Support (Sketchfab embeds) ──
  { asset_id: "a31", callsign: "THUNDER-01", asset_type: "M777 Howitzer", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/a17c26dbc0394579b7072ae1faf7be34/embed", latitude: 34.2800, longitude: 40.6300, altitude_m: 340, heading_deg: 45.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 41200 58900" },
  { asset_id: "a32", callsign: "STEEL-RAIN-01", asset_type: "M142 HIMARS", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/53c53a112c674d29a2afdbddbe3cecb5/embed", latitude: 34.4500, longitude: 40.7100, altitude_m: 290, heading_deg: 330.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 43100 60200" },
  { asset_id: "a33", callsign: "BASEPLATE-01", asset_type: "M224 Mortar", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/c86a73e40d994431bcdb57dc741cf8be/embed", latitude: 34.1800, longitude: 40.8500, altitude_m: 310, heading_deg: 0.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 44200 57800" },
  // ── Logistics / Supply (Sketchfab embeds) ──
  { asset_id: "a34", callsign: "ATLAS-01", asset_type: "C-17 Globemaster III", asset_class: "Logistics", model_path: null, embed_url: "https://sketchfab.com/models/2d9e934e129a4e048fd19b98328acd78/embed", latitude: 35.8200, longitude: 41.5000, altitude_m: 8500, heading_deg: 90.0, pitch_deg: -2.5, roll_deg: 0, speed_kmh: 830, status: "ACTIVE", sensor_type: null, mgrs: "38SMH 22100 35600" },
  { asset_id: "a35", callsign: "SUPPLY-07", asset_type: "M977 HEMTT Supply Truck", asset_class: "Logistics", model_path: null, embed_url: "https://sketchfab.com/models/a124427dfe894948a1ffa985f26ea5cc/embed", latitude: 34.3100, longitude: 40.9500, altitude_m: 270, heading_deg: 120.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 55, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 45600 59100" },
  { asset_id: "a36", callsign: "MEDIC-01", asset_type: "Field Hospital", asset_class: "Logistics", model_path: null, embed_url: "https://sketchfab.com/models/7820c7442e644a2eab396ec312fa3700/embed", latitude: 34.6200, longitude: 41.1500, altitude_m: 220, heading_deg: 0.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "OPERATIONAL", sensor_type: null, mgrs: "38SLH 48200 62100" },
  // ── Naval (expanded, Sketchfab embeds) ──
  { asset_id: "a37", callsign: "SHADOW-01", asset_type: "USS Seawolf SSN-21", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/90ebfc165a6148e38cb2d7245dc2cd48/embed", latitude: 34.9000, longitude: 35.2000, altitude_m: -120, heading_deg: 195.0, pitch_deg: -3.0, roll_deg: 0, speed_kmh: 46, status: "ACTIVE", sensor_type: "BQQ-10 Sonar", mgrs: "36SVF 55200 64100" },
  { asset_id: "a38", callsign: "GATOR-01", asset_type: "USS Wasp LHD-1", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/8e68ca4a3b854b2f8f19b942ae944466/embed", latitude: 34.7500, longitude: 35.5000, altitude_m: 0, heading_deg: 270.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 37, status: "ACTIVE", sensor_type: "AN/SPS-52 Radar", mgrs: "36SVF 58300 47200" },
  // ── Electronic Warfare (Sketchfab embeds) ──
  { asset_id: "a39", callsign: "JAMMER-01", asset_type: "EW Radar Vehicle", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/f954fdaf89054d2e824b032680d3ca74/embed", latitude: 34.5500, longitude: 40.6800, altitude_m: 350, heading_deg: 60.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 0, status: "ACTIVE", sensor_type: "AESA Jammer Array", mgrs: "38SLH 42800 61400" },
  // ── OPFOR / Enemy Assets (Sketchfab embeds) ──
  { asset_id: "a40", callsign: "HOSTILE-T72-01", asset_type: "T-72A MBT", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/f55f5b31539f4586b6b75e162af65b77/embed", latitude: 35.3200, longitude: 40.3500, altitude_m: 380, heading_deg: 210.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 40, status: "ACTIVE", sensor_type: "1A40 Fire Control", mgrs: "37SFV 90100 25800" },
  { asset_id: "a41", callsign: "HOSTILE-BMP-01", asset_type: "BMP-2 IFV", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/2ad92d48e2054b179bd2a5474efc86ac/embed", latitude: 35.3500, longitude: 40.3800, altitude_m: 375, heading_deg: 215.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 35, status: "ACTIVE", sensor_type: null, mgrs: "37SFV 90400 26100" },
  { asset_id: "a42", callsign: "HOSTILE-TECH-01", asset_type: "Technical (Armed Pickup)", asset_class: "Military", model_path: null, embed_url: "https://sketchfab.com/models/bc5604e0a7b341909de1077d0b3bc176/embed", latitude: 34.9800, longitude: 40.2100, altitude_m: 420, heading_deg: 160.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 65, status: "ACTIVE", sensor_type: null, mgrs: "37SFV 86400 22100" },
  // ── Civilian / Protected (Sketchfab embeds) ──
  { asset_id: "a43", callsign: "CIV-BUS-01", asset_type: "Civilian Bus", asset_class: "Infrastructure", model_path: null, embed_url: "https://sketchfab.com/models/02c9f34db5714ac09a20445656f13d6a/embed", latitude: 34.6000, longitude: 40.7500, altitude_m: 260, heading_deg: 90.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 40, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 42500 60800" },
  { asset_id: "a44", callsign: "CIV-SEDAN-01", asset_type: "Civilian Sedan", asset_class: "Infrastructure", model_path: null, embed_url: "https://sketchfab.com/models/bab77902c638427bb85e68b6762a481f/embed", latitude: 34.5800, longitude: 40.7800, altitude_m: 255, heading_deg: 270.0, pitch_deg: 0, roll_deg: 0, speed_kmh: 50, status: "ACTIVE", sensor_type: null, mgrs: "38SLH 42900 60500" },
];

const CLASS_COLORS: Record<string, string> = {
  Military: "#00A8DC",
  Infrastructure: "#C87619",
  Logistics: "#94A3B8",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#32A467",
  LOITER: "#EC9A3C",
  RTB: "#E76A6E",
  HOLDING: "#4C90F0",
  OPERATIONAL: "#32A467",
  STORED: "#64748B",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [selectedId, setSelectedId] = useState<string>("a1");
  const asset = MOCK_ASSETS.find((a) => a.asset_id === selectedId) ?? MOCK_ASSETS[0];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Asset list */}
      <div className="w-[260px] border-r border-[var(--om-border)] flex flex-col overflow-y-auto bg-[var(--om-bg-deep)]">
        <div className="px-3 py-2.5 border-b border-[var(--om-border)]">
          <span className="text-[10px] font-semibold text-[var(--om-text-secondary)] uppercase tracking-[0.12em]">
            Fleet Assets
          </span>
        </div>

        {MOCK_ASSETS.map((a) => {
          const active = a.asset_id === selectedId;
          const statusColor = STATUS_COLORS[a.status] ?? "#71717a";

          return (
            <button
              key={a.asset_id}
              onClick={() => setSelectedId(a.asset_id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-[var(--om-border)] ${
                active ? "bg-[var(--om-bg-primary)]" : "hover:bg-[var(--om-bg-elevated)]"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[var(--om-text-primary)] truncate">
                    {a.callsign}
                  </span>
                  <span
                    className="text-[8px] font-bold px-1.5 py-px rounded-none shrink-0"
                    style={{ background: statusColor + "20", color: statusColor }}
                  >
                    {a.status}
                  </span>
                </div>
                <span className="text-[9px] text-[var(--om-text-muted)]">{a.asset_type}</span>
              </div>
              {active && <ChevronRight size={12} className="text-[var(--om-text-muted)] shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-none"
            style={{
              background: CLASS_COLORS[asset.asset_class] + "20",
              color: CLASS_COLORS[asset.asset_class],
            }}
          >
            {asset.asset_class.toUpperCase()}
          </span>
          <h1 className="text-[14px] font-semibold text-[var(--om-text-primary)]">
            {asset.callsign}
          </h1>
          <span className="text-[11px] text-[var(--om-text-muted)]">{asset.asset_type}</span>
          <span
            className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-none"
            style={{
              background: (STATUS_COLORS[asset.status] ?? "#71717a") + "20",
              color: STATUS_COLORS[asset.status] ?? "#71717a",
            }}
          >
            {asset.status}
          </span>
        </div>

        {/* 3D viewer + telemetry */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 3D model */}
          <div className="flex-1 min-w-0">
            {(asset.model_path || asset.embed_url) ? (
              <AssetModelViewer
                modelPath={asset.model_path ?? ""}
                heading={asset.heading_deg}
                pitch={asset.pitch_deg}
                roll={asset.roll_deg}
                embedUrl={asset.embed_url}
              />
            ) : (
              <div className="w-full h-full bg-[var(--om-bg-deep)] rounded-none border border-[var(--om-border)] flex items-center justify-center">
                <span className="text-[11px] text-[var(--om-text-muted)]">No 3D model available</span>
              </div>
            )}
          </div>

          {/* Telemetry panel */}
          <div className="w-[220px] shrink-0 bg-[var(--om-bg-deep)] rounded-none border border-[var(--om-border)] p-4 flex flex-col gap-4 overflow-y-auto">
            <TelemetrySection title="Platform">
              <TelemetryRow label="Altitude (MSL)" value={`${asset.altitude_m.toLocaleString()}m`} />
              <TelemetryRow label="Heading" value={`${asset.heading_deg.toFixed(2)}°`} />
              <TelemetryRow label="Pitch" value={`${asset.pitch_deg.toFixed(2)}°`} />
              <TelemetryRow label="Roll" value={`${asset.roll_deg.toFixed(2)}°`} />
              <TelemetryRow label="Speed" value={`${asset.speed_kmh} km/h`} />
              <TelemetryRow label="Location" value={asset.mgrs} />
            </TelemetrySection>

            {asset.sensor_type && (
              <TelemetrySection title="Sensor">
                <TelemetryRow label="Type" value={asset.sensor_type} />
                <TelemetryRow label="Rel. Azimuth" value="269.83°" />
                <TelemetryRow label="Rel. Roll" value="0°" />
                <TelemetryRow label="Rel. Elevation" value="-22.67°" />
                <TelemetryRow label="SPI Location" value="38SLH 53152 99623" />
                <TelemetryRow label="SPI Elevation" value="11.27m" />
              </TelemetrySection>
            )}

            <TelemetrySection title="Position">
              <TelemetryRow label="Latitude" value={asset.latitude.toFixed(6)} />
              <TelemetryRow label="Longitude" value={asset.longitude.toFixed(6)} />
              <TelemetryRow label="MGRS" value={asset.mgrs} />
            </TelemetrySection>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Telemetry sub-components ─────────────────────────────────────────────────

function TelemetrySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[var(--om-text-secondary)] uppercase tracking-[0.12em] mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-[var(--om-text-muted)]">{label}</span>
      <span className="text-[10px] text-[var(--om-text-secondary)] font-[family-name:var(--font-mono)] text-right">
        {value}
      </span>
    </div>
  );
}
