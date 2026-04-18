const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const { trip_name, type, startDate, endDate } = req.query;
    let sql = 'SELECT * FROM travel WHERE user_id=?';
    const params = [req.session.userId];
    if (trip_name) { sql += ' AND trip_name LIKE ?'; params.push(`%${trip_name}%`); }
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (startDate) { sql += ' AND date>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND date<=?'; params.push(endDate); }
    sql += ' ORDER BY date DESC';
    res.json({ travel: db.prepare(sql).all(...params) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.add = (req, res) => {
  try {
    const { trip_name, type, amount, date, origin, destination, distance_km, fuel_cost, notes, transport_mode } = req.body;
    if (!type || !amount || !date) return res.status(400).json({ error: 'Type, amount, date required' });
    const tripId = trip_name ? trip_name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() : null;
    const result = db.prepare(`INSERT INTO travel (user_id, trip_name, trip_id, type, transport_mode, amount, date, origin, destination, distance_km, fuel_cost, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.session.userId, trip_name || null, tripId, type, transport_mode || null, parseFloat(amount), date, origin || null, destination || null, distance_km ? parseFloat(distance_km) : null, fuel_cost ? parseFloat(fuel_cost) : null, notes || null);
    res.status(201).json({ travel: db.prepare('SELECT * FROM travel WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM travel WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    const { trip_name, type, amount, date, origin, destination, distance_km, fuel_cost, notes, transport_mode } = req.body;
    db.prepare(`UPDATE travel SET trip_name=COALESCE(?,trip_name), type=COALESCE(?,type), transport_mode=COALESCE(?,transport_mode), amount=COALESCE(?,amount), date=COALESCE(?,date), origin=COALESCE(?,origin), destination=COALESCE(?,destination), distance_km=COALESCE(?,distance_km), fuel_cost=COALESCE(?,fuel_cost), notes=COALESCE(?,notes) WHERE id=?`).run(trip_name || null, type || null, transport_mode || null, amount ? parseFloat(amount) : null, date || null, origin || null, destination || null, distance_km ? parseFloat(distance_km) : null, fuel_cost ? parseFloat(fuel_cost) : null, notes || null, id);
    res.json({ travel: db.prepare('SELECT * FROM travel WHERE id=?').get(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM travel WHERE id=? AND user_id=?').get(id, req.session.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM travel WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.summary = (req, res) => {
  try {
    const userId = req.session.userId;
    const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(distance_km),0) as distance, COALESCE(SUM(fuel_cost),0) as fuel FROM travel WHERE user_id=?`).get(userId);
    const byType = db.prepare(`SELECT type, SUM(amount) as total, COUNT(*) as count FROM travel WHERE user_id=? GROUP BY type ORDER BY total DESC`).all(userId);
    const trips = db.prepare(`SELECT trip_name, SUM(amount) as total, COUNT(*) as count, MIN(date) as start_date, MAX(date) as end_date FROM travel WHERE user_id=? AND trip_name IS NOT NULL GROUP BY trip_name ORDER BY end_date DESC`).all(userId);
    res.json({ total: total.total, totalDistance: total.distance, totalFuel: total.fuel, byType, trips });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};