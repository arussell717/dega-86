import { sql } from '@vercel/postgres';

async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS crew_members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'crew',
    email TEXT,
    phone TEXT,
    rsvp_status TEXT DEFAULT 'invited',
    avatar_color TEXT,
    flight_airline TEXT,
    flight_number TEXT,
    flight_from TEXT,
    flight_depart TEXT,
    flight_arrive TEXT,
    arrival_airport TEXT,
    rv_id INTEGER,
    notes TEXT,
    invite_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS rvs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    confirmation TEXT,
    capacity INTEGER DEFAULT 6,
    cost_cents INTEGER DEFAULT 0,
    driver_crew_id INTEGER,
    pickup_location TEXT,
    pickup_time TEXT,
    dropoff_time TEXT,
    status TEXT DEFAULT 'reserved',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS costs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    category TEXT NOT NULL,
    paid_by INTEGER,
    split_among_json TEXT,
    split_mode TEXT DEFAULT 'all_in',
    split_custom_json TEXT,
    settled BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS itinerary_items (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    description TEXT,
    link TEXT,
    type TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS updates (
    id SERIAL PRIMARY KEY,
    author TEXT NOT NULL,
    message TEXT NOT NULL,
    pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS packing_items (
    id SERIAL PRIMARY KEY,
    item TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    checked BOOLEAN DEFAULT false,
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    blob_key TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    category TEXT DEFAULT 'doc',
    uploaded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  // seed crew if empty
  const { rows } = await sql`SELECT COUNT(*)::int AS c FROM crew_members`;
  if (rows[0].c === 0) {
    await sql`INSERT INTO crew_members (name, role, email, phone, rsvp_status) VALUES
      ('Austin Russell', 'organizer', 'austin.r@example.com', '4105997533', 'in'),
      ('Dan Rohe', 'bachelor', 'dan.rohe@example.com', '4437529961', 'in'),
      ('Kevin Rohe', 'planner', 'kevin.rohe@example.com', '4436178387', 'in'),
      ('Nick Webster', 'crew', 'nick.webster@example.com', '4439870267', 'in')`;
    // seed itinerary
    await sql`INSERT INTO itinerary_items (date, time, title, location, description, type) VALUES
      ('2026-10-23','09:00','Fly to ATL','Hartsfield-Jackson ATL','Arrive Atlanta','travel'),
      ('2026-10-23','12:00','RV pickup – Atlanta','ATL','','logistics'),
      ('2026-10-23','14:30','Buc-ee''s – Leeds, AL','Buc-ee''s Leeds','Fuel / snacks – mile ~85 en route','food'),
      ('2026-10-23','17:00','Talladega North Park check-in','Talladega Superspeedway','','logistics'),
      ('2026-10-24','10:00','Pre-race / Garage','Talladega','','race'),
      ('2026-10-24','14:00','Garage & souvenir shopping','Talladega','','race'),
      ('2026-10-25','13:00','YellaWood 500','Talladega Superspeedway','Race starts 1PM CT','race'),
      ('2026-10-26','09:00','Drive back to ATL','ATL','','travel'),
      ('2026-10-26','15:00','Fly out','ATL','','travel')`;
  }
}

function mapCrew(r:any){ return { id:r.id, name:r.name, role:r.role, email:r.email, phone:r.phone, rsvpStatus:r.rsvp_status, avatarColor:r.avatar_color, flightAirline:r.flight_airline, flightNumber:r.flight_number, flightFrom:r.flight_from, flightDepart:r.flight_depart, flightArrive:r.flight_arrive, arrivalAirport:r.arrival_airport, rvId:r.rv_id, notes:r.notes, inviteOrder:r.invite_order, createdAt: new Date(r.created_at).getTime() };}
function mapRv(r:any){ return { id:r.id, name:r.name, company:r.company, confirmation:r.confirmation, capacity:r.capacity, costCents:r.cost_cents, driverCrewId:r.driver_crew_id, pickupLocation:r.pickup_location, pickupTime:r.pickup_time, dropoffTime:r.dropoff_time, status:r.status, createdAt: new Date(r.created_at).getTime() };}
function mapCost(r:any){ return { id:r.id, title:r.title, amountCents:r.amount_cents, category:r.category, paidBy:r.paid_by, splitAmongJson:r.split_among_json, splitMode:r.split_mode, splitCustomJson:r.split_custom_json, settled:r.settled, notes:r.notes, createdAt: new Date(r.created_at).getTime() };}
function mapItin(r:any){ return { id:r.id, date:r.date, time:r.time, title:r.title, location:r.location, description:r.description, link:r.link, type:r.type, createdAt: new Date(r.created_at).getTime() };}

export default async function handler(req:any, res:any){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    await ensureSchema();
    const { method, args = {} } = req.body || {};
    switch(method){
      case 'getAllData': {
        const [crew, rvs, costs, itinerary] = await Promise.all([
          sql`SELECT * FROM crew_members ORDER BY id`,
          sql`SELECT * FROM rvs ORDER BY id`,
          sql`SELECT * FROM costs ORDER BY id`,
          sql`SELECT * FROM itinerary_items ORDER BY date, time`,
        ]);
        return res.json({ crew: crew.rows.map(mapCrew), rvs: rvs.rows.map(mapRv), costs: costs.rows.map(mapCost), itinerary: itinerary.rows.map(mapItin), updates:[], packing:[], documents:[], weather:{ location:"Talladega, AL", data:{ conditions:{ temperature:93, unit:"°F", description:"PARTLY CLOUDY", high:95, low:68, feels_like:95, humidity_percent:55, wind:"5 mph SE" }, summary:"Partly cloudy", forecast_days:[] }, fetchedAt:new Date().toISOString() } });
      }
      case 'addCrewMember': {
        const r = await sql`INSERT INTO crew_members (name, role, email, phone, rsvp_status, avatar_color, flight_airline, flight_number, flight_from, flight_depart, flight_arrive, arrival_airport, rv_id, notes)
          VALUES (${args.name}, ${args.role||'crew'}, ${args.email||null}, ${args.phone||null}, ${args.rsvpStatus||'invited'}, ${args.avatarColor||null}, ${args.flightAirline||null}, ${args.flightNumber||null}, ${args.flightFrom||null}, ${args.flightDepart||null}, ${args.flightArrive||null}, ${args.arrivalAirport||null}, ${args.rvId?Number(args.rvId):null}, ${args.notes||null}) RETURNING id`;
        return res.json({ id: r.rows[0].id });
      }
      case 'updateCrewMember': {
        await sql`UPDATE crew_members SET name=${args.name}, role=${args.role}, email=${args.email||null}, phone=${args.phone||null}, rsvp_status=${args.rsvpStatus||'invited'}, avatar_color=${args.avatarColor||null}, flight_airline=${args.flightAirline||null}, flight_number=${args.flightNumber||null}, flight_from=${args.flightFrom||null}, flight_depart=${args.flightDepart||null}, flight_arrive=${args.flightArrive||null}, arrival_airport=${args.arrivalAirport||null}, rv_id=${args.rvId?Number(args.rvId):null}, notes=${args.notes||null} WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'deleteCrewMember': {
        await sql`DELETE FROM crew_members WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'addRV': {
        const r = await sql`INSERT INTO rvs (name, company, confirmation, capacity, cost_cents, driver_crew_id, pickup_location, pickup_time, dropoff_time, status)
          VALUES (${args.name}, ${args.company||null}, ${args.confirmation||null}, ${Number(args.capacity)||6}, ${Number(args.costCents)||0}, ${args.driverCrewId?Number(args.driverCrewId):null}, ${args.pickupLocation||null}, ${args.pickupTime||null}, ${args.dropoffTime||null}, ${args.status||'reserved'}) RETURNING id`;
        return res.json({ id: r.rows[0].id });
      }
      case 'updateRV': {
        await sql`UPDATE rvs SET name=${args.name}, company=${args.company||null}, confirmation=${args.confirmation||null}, capacity=${Number(args.capacity)||6}, cost_cents=${Number(args.costCents)||0}, driver_crew_id=${args.driverCrewId?Number(args.driverCrewId):null}, pickup_location=${args.pickupLocation||null}, pickup_time=${args.pickupTime||null}, dropoff_time=${args.dropoffTime||null}, status=${args.status||'reserved'} WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'deleteRV': {
        await sql`DELETE FROM rvs WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'addCost': {
        const title = args.title ?? args.description ?? 'Expense';
        const rawAmount = args.amountCents ?? args.amount ?? 0;
        const amount_cents = Number.isFinite(Number(rawAmount)) ? Math.round(Number(rawAmount) * (args.amountCents != null ? 1 : 100)) : 0;
        const paid_by_val = args.paidBy ?? args.paid_by ?? null;
        const paid_by = paid_by_val != null && !isNaN(Number(paid_by_val)) && Number(paid_by_val) !== 0 ? Number(paid_by_val) : null;
        let split_among_json = args.splitAmongJson ?? null;
        if (!split_among_json && Array.isArray(args.splitAmong)) split_among_json = JSON.stringify(args.splitAmong);
        const r = await sql`INSERT INTO costs (title, amount_cents, category, paid_by, split_among_json, split_mode, split_custom_json, settled, notes)
          VALUES (${title}, ${amount_cents}, ${args.category||'other'}, ${paid_by}, ${split_among_json}, ${args.splitMode||'all_in'}, ${args.splitCustomJson||null}, ${!!args.settled}, ${args.notes||null}) RETURNING id`;
        return res.json({ id: r.rows[0].id });
      }
      case 'updateCost': {
        const title = args.title ?? args.description ?? 'Expense';
        const rawAmount = args.amountCents ?? args.amount ?? 0;
        const amount_cents = Number.isFinite(Number(rawAmount)) ? Math.round(Number(rawAmount) * (args.amountCents != null ? 1 : 100)) : 0;
        const paid_by_val = args.paidBy ?? args.paid_by ?? null;
        const paid_by = paid_by_val != null && !isNaN(Number(paid_by_val)) && Number(paid_by_val) !== 0 ? Number(paid_by_val) : null;
        let split_among_json = args.splitAmongJson ?? null;
        if (!split_among_json && Array.isArray(args.splitAmong)) split_among_json = JSON.stringify(args.splitAmong);
        await sql`UPDATE costs SET title=${title}, amount_cents=${amount_cents}, category=${args.category||'other'}, paid_by=${paid_by}, split_among_json=${split_among_json}, split_mode=${args.splitMode||'all_in'}, split_custom_json=${args.splitCustomJson||null}, settled=${!!args.settled}, notes=${args.notes||null} WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'deleteCost': {
        await sql`DELETE FROM costs WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'addItineraryItem': {
        const r = await sql`INSERT INTO itinerary_items (date, time, title, location, description, link, type)
          VALUES (${args.date}, ${args.time}, ${args.title}, ${args.location||null}, ${args.description||null}, ${args.link||null}, ${args.type||'general'}) RETURNING id`;
        return res.json({ id: r.rows[0].id });
      }
      case 'updateItineraryItem': {
        await sql`UPDATE itinerary_items SET date=${args.date}, time=${args.time}, title=${args.title}, location=${args.location||null}, description=${args.description||null}, link=${args.link||null}, type=${args.type||'general'} WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'deleteItineraryItem': {
        await sql`DELETE FROM itinerary_items WHERE id=${Number(args.id)}`;
        return res.json({ ok:true });
      }
      case 'addUpdate':
      case 'uploadDocument':
      case 'addPackingItem':
        return res.json({ id: 1 });
      case 'deleteDocument':
      case 'togglePackingItem':
        return res.json({ ok:true });
      default:
        return res.status(400).json({ error: 'unknown method '+method });
    }
  } catch (e:any) {
    return res.status(500).json({ error: e.message });
  }
}
