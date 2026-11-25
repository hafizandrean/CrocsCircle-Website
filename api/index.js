/**
 * Vercel Serverless Function Bridge for CrocsCircle.ID
 * Routes all /api/... and /exec calls to server.js
 */
const server = require('../server.js');

module.exports = (req, res) => {
  server.emit('request', req, res);
};
