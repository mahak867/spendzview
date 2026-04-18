const db = require('../models/db');

exports.list = (req, res) => {
  try {
    const investments = db.prepare('SELECT * FROM investments WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
    res.json({ investments });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.add = (req, res) => {
  try {
    const { name, type, invested_amount, current_value, units, buy_price, current_price, start_date, maturity_date, platform, folio_number, sip_amount, sip_date, notes } = req.body;
    if (!name || !type || !invested_amount) return res.status(400).json({ error: 'Name, type and invested amount required' });
    const result = db.prepare(
      `INSERT INTO investments (user_id, name, type, invested_amount, current_value, units, buy_price, current_price, start_date, maturity_date, platform, folio_number, sip_amount, sip_date, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.session.userId, name, type, parseFloat(invested_amount), parseFloat(current_value || invested_amount), parseFloat(units || 0), parseFloat(buy_price || 0), parseFloat(current_price || 0), start_date || null, maturity_date || null, platform || null, folio_number || null, parseFloat(sip_amount || 0), sip_date ? parseInt(sip_date) : null, notes || null);
    res.status(201).json({ investment: db.prepare('SELECT * FROM investments WHERE id=?').get(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM investments WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    const { name, type, invested_amount, current_value, units, current_price, maturity_date, platform, notes } = req.body;
    db.prepare(`UPDATE investments SET name=COALESCE(?,name), type=COALESCE(?,type), invested_amount=COALESCE(?,invested_amount),
      current_value=COALESCE(?,current_value), units=COALESCE(?,units), current_price=COALESCE(?,current_price),
      maturity_date=COALESCE(?,maturity_date), platform=COALESCE(?,platform), notes=COALESCE(?,notes) WHERE id=?`)
      .run(name||null, type||null, invested_amount?parseFloat(invested_amount):null, current_value?parseFloat(current_value):null,
        units?parseFloat(units):null, current_price?parseFloat(current_price):null, maturity_date||null, platform||null, notes!==undefined?notes:null, id);
    res.json({ investment: db.prepare('SELECT * FROM investments WHERE id=?').get(id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM investments WHERE id=? AND user_id=?').get(id, req.session.userId))
      return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM investments WHERE id=?').run(id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.portfolio = (req, res) => {
  try {
    const userId = req.session.userId;
    const investments = db.prepare('SELECT * FROM investments WHERE user_id=?').all(userId);
    const totalInvested = investments.reduce((s, i) => s + i.invested_amount, 0);
    const totalCurrent = investments.reduce((s, i) => s + (i.current_value || i.invested_amount), 0);
    const totalGainLoss = totalCurrent - totalInvested;
    const gainPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
    const byType = {};
    investments.forEach(i => {
      if (!byType[i.type]) byType[i.type] = { invested: 0, current: 0 };
      byType[i.type].invested += i.invested_amount;
      byType[i.type].current += (i.current_value || i.invested_amount);
    });
    res.json({ investments, totalInvested, totalCurrent, totalGainLoss, gainPct: gainPct.toFixed(2), byType });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
