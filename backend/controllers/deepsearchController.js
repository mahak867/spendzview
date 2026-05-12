const { runDeepSearchQuery } = require('../services/deepsearchService');

/**
 * Execute a DeepSearch query for the authenticated user.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
exports.query = (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    const response = runDeepSearchQuery(req.session.userId, query);
    return res.json(response);
  } catch (error) {
    console.error('DeepSearch error:', error);
    return res.status(500).json({ error: error.message });
  }
};
