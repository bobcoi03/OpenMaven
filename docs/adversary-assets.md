# Adversary Asset Library Reference

Comprehensive catalog of red force equipment for scenario building. For each asset: name, category, speed, weapons/sensors, and 3D model availability on Sketchfab.

**Sketchfab workflow:** Web search asset type → search Sketchfab for embeddable model → grab embed URL → add to `ASSET_EMBED_MAP` in `asset-detail-panel.tsx` → manual QA pass (~20% need fixing for wrong/low-quality models).

**Fallback:** When no Sketchfab model exists (marked "Rare" below), use NATO APP-6D symbology with correct SIDC hostile codes. Already in the codebase via milsymbol.

---

## Russia

### Ground
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| T-90M Proryv MBT | Armor | 60 | 125mm smoothbore, Relikt ERA, Kalina FCS | Yes |
| T-72B3 MBT | Armor | 60 | 125mm 2A46M, Kontakt-5 ERA, Sosna-U thermal | Yes |
| T-14 Armata MBT | Armor | 80 | 125mm unmanned turret, Afghanit APS, Malachit ERA | Yes |
| BMP-3 IFV | Armor | 70 | 100mm gun/launcher, 30mm autocannon, AT-10 ATGM | Yes |
| BTR-82A APC | Armor | 80 | 30mm 2A72 autocannon, TKN-4GA thermal | Yes |
| Tigr-M Armored Car | Infantry | 125 | 12.7mm Kord / Kornet ATGM mount | Yes |

### Aircraft
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Su-35S Flanker-E | Aircraft | 2,390 | Irbis-E PESA, R-77-1/R-73 AAMs, KAB-500 PGMs | Yes |
| Su-34 Fullback | Aircraft | 1,900 | Leninets radar, Kh-29/Kh-31 ASMs, KAB-1500 | Yes |
| Su-57 Felon | Aircraft | 2,600 | Sh121 AESA, R-77M / Kh-59MK2, stealth | Yes |
| Ka-52 Alligator | Aircraft | 300 | mmW radar, Vikhr-1 ATGMs, 30mm 2A42 | Yes |
| Mi-28NM Night Hunter | Aircraft | 305 | N025E radar, Ataka-V ATGMs, 30mm | Yes |

### Air Defense
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| S-400 Triumf | Air Defense | TEL: 60 | 91N6E radar, 40N6E missile (400 km range) | Yes |
| S-300PMU-2 | Air Defense | TEL: 60 | 30N6E2 radar, 200 km range | Yes |
| Pantsir-S1 | Air Defense | 90 | Phased array, 30mm guns + 57E6 missiles (20 km) | Yes |
| Buk-M3 | Air Defense | 65 | PESA radar, 70 km range | Limited |
| Tor-M2 | Air Defense | 65 | 3D radar, 16 km range, autonomous | Yes |

### Artillery & Missiles
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| 2S19M2 Msta-S SPH | Artillery | 60 | 152mm, 40 km range with Krasnopol | Yes |
| BM-30 Smerch MLRS | Artillery | 60 | 12x 300mm rockets, 90 km range | Yes |
| Iskander-M | Artillery | TEL: 70 | 500 km ballistic + 2500 km cruise missile | Yes |
| Orlan-10 UAV | Drone | 150 | EO/IR, EW payload, artillery spotting | Yes |
| Lancet-3 Loitering Munition | Drone | 110 | EO/IR seeker, 3 kg HE, 40 km range | Limited |

---

## China (PLA)

### Ground
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| ZTZ-99A (Type 99A) MBT | Armor | 80 | 125mm smoothbore, GL-5 APS, FY-4 ERA | Limited |
| ZTZ-96B MBT | Armor | 65 | 125mm smoothbore, FY-2 ERA, laser warning | Limited |
| ZBD-04A IFV | Armor | 65 | 100mm + 30mm, HJ-8 ATGM | Limited |
| ZBL-08 Wheeled IFV | Armor | 100 | 30mm autocannon, HJ-73C ATGM | Limited |

### Aircraft
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| J-20A Mighty Dragon | Aircraft | 2,100+ | KLJ-5 AESA, PL-15 (300 km) / PL-10E, stealth | Yes |
| J-16 | Aircraft | 2,400 | AESA, PL-15, YJ-83K AShM, LS-6 PGMs | Limited |
| J-10C Vigorous Dragon | Aircraft | 2,200 | KLJ-7A AESA, PL-15 / PL-10 | Yes |
| H-6K/N Bomber | Aircraft | 1,050 | 6x CJ-20 cruise missiles (2500 km range) | Limited |
| Z-10ME Attack Helo | Aircraft | 270 | HJ-10 ATGMs, TY-90 AAMs, 23mm | Limited |

### Naval
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Type 055 Renhai Cruiser | Naval | 56 | 112-cell VLS, Type 346B AESA | Limited |
| Type 052D Luyang III DDG | Naval | 56 | 64-cell VLS, HHQ-9B, 130mm gun | Limited |
| Type 039A Yuan SSK | Naval | 37 submerged | 6x torpedo tubes, YJ-82, AIP | Rare |

### Air Defense & Missiles
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| HQ-9B | Air Defense | Static | Phased array, 200 km range | Rare |
| DF-21D ASBM ("carrier killer") | Artillery | Static | 1,500 km, maneuvering RV, radar/IR seeker | Rare |
| DF-26 IRBM | Artillery | Static | 4,000 km, dual nuclear/conventional | Rare |
| Wing Loong II UCAV | Drone | 370 | EO/IR/SAR, Blue Arrow 7 ATGMs, 20h endurance | Limited |

---

## Iran

### Ground & IRGC
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Karrar MBT | Armor | 70 | 125mm smoothbore, ERA, EO FCS | Rare |
| T-72S (locally upgraded) | Armor | 60 | 125mm, Kontakt-1 ERA, local thermals | Yes (base T-72) |

### Ballistic Missiles
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Shahab-3 MRBM | Artillery | Static | 1,300 km, 750-1000 kg warhead | Rare |
| Fateh-313 SRBM | Artillery | Static | 500 km, solid-fueled, GPS/INS | Rare |

### Drones
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Shahed-136 Loitering Munition | Drone | 185 | 40 kg HE, GPS/INS, 2500 km range, swarm-capable | Limited |
| Mohajer-6 UCAV | Drone | 200 | Qaem PGM, Almas ATGM, 12h endurance | Rare |

### Naval (IRGCN)
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Zolfaghar Fast Attack Craft | Naval | 130 | 2x Nasr-1 AShMs, speed-boat swarm doctrine | Rare |

---

## North Korea (KPA)

| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Pokpung-ho MBT | Armor | 60 | 125mm, Kornet-copy ATGM, ERA | Rare |
| M-1978 Koksan 170mm SPG | Artillery | 40 | 170mm, 40-60 km range, can strike Seoul | Rare |
| KN-23 SRBM (Iskander copy) | Artillery | Static | 600 km, maneuvering terminal phase | Rare |
| KN-25 600mm Super-Large MLRS | Artillery | Static | 380 km, guided | Rare |
| MiG-29 Fulcrum | Aircraft | 2,400 | N019 radar, R-27/R-73 AAMs | Yes |

---

## Non-State Actors

### ISIS / ISIL
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Toyota Hilux Technical (HMG) | Infantry | 170 | DShK 12.7mm or ZU-23-2 23mm | Yes |
| Up-armored SVBIED | Infantry | 120 | 500+ kg HE, improvised armor | Limited |
| IED (Roadside) | Infantry | Static | 10-50 kg HE, victim-operated | N/A |
| Captured M1114 HMMWV | Armor | 113 | M2 .50 cal / Mk 19 | Yes |
| Captured T-55 | Armor | 50 | 100mm main gun | Yes |
| Modified DJI Drone (IED dropper) | Drone | 70 | 40mm grenade dropper | Yes (base) |
| RPG-7 Team | Infantry | Manportable | PG-7VL HEAT, TBG-7V thermobaric | Yes |
| ZU-23-2 AA Gun (ground role) | Infantry | Towed | 2x 23mm, truck-mounted | Yes |

### Hezbollah
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Fateh-110 / M-600 SRBM | Artillery | Static | 300 km, 500 kg, GPS/INS | Rare |
| Kornet-E ATGM | Infantry | Manportable | 5.5 km, tandem HEAT (1200mm) | Limited |
| C-802 / Noor AShM | Naval | 280 cruise | 120 km, radar/IR seeker | Rare |

### Houthi Rebels
| Asset | Category | Speed (km/h) | Weapons/Sensors | Sketchfab |
|-------|----------|--------------|-----------------|-----------|
| Burkan-2H MRBM | Artillery | Static | 800+ km, separating warhead | Rare |
| Quds-2 Cruise Missile | Artillery | 250 | 1500 km, turbojet, GPS/INS | Rare |
| Samad-3 One-Way Attack UAV | Drone | 250 | 1500+ km, 18 kg warhead | Rare |
| Explosive-laden USV (boat) | Naval | 55 | 200-500 kg HE, remote/autonomous | Rare |

---

## Infrastructure Types (Targetable)

### Military
| Type | Description | Key Signatures |
|------|-------------|----------------|
| Forward Operating Base | HESCO barriers, guard towers, helipad | 200-800m diameter |
| Hardened Aircraft Shelter | Concrete arch bunker for 1-2 aircraft | 25x35m, taxiway connected |
| Airfield / Air Base | Runways, aprons, fuel storage | 2-4 km runway |
| Underground Bunker Complex | Deep buried C2 or storage | Blast doors, vent shafts |
| Radar Installation | Rotating antenna, radome, support vans | 100x100m |
| Ammunition Storage Point | Earth-bermed magazines | Regular spacing, berms |

### Energy
| Type | Description | Key Signatures |
|------|-------------|----------------|
| Thermal Power Plant | Gas/oil electricity generation | Cooling towers, smokestacks |
| Oil Refinery | Crude → fuel processing | Distillation columns, tank farms, flare stacks |
| Pipeline Junction | Pumping station | Pipes, valve stations |
| Fuel Storage Farm | Above-ground tank farm | Circular tanks, containment berms |
| Electrical Substation | HV transformation | Transformers, bus bars, insulators |

### Transport
| Type | Description | Key Signatures |
|------|-------------|----------------|
| Highway Bridge | Multi-lane, 200-2000m span | Piers, deck, approach ramps |
| Railway Bridge | 100-500m span, steel truss | Rail alignment |
| Seaport | Container cranes, berths | 1-10 km coastline |
| Railway Marshalling Yard | Train sorting, 1-3 km | 20+ parallel tracks |

### Communications
| Type | Description | Key Signatures |
|------|-------------|----------------|
| Radio/TV Broadcast Tower | 50-600m lattice tower | Aviation lights |
| Satellite Ground Station | 5-15m parabolic dishes | Radomes |
| Data Center | Servers, network ops | Cooling units, generators, no windows |
