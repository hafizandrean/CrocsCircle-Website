/**
 * Vercel Serverless Function Default Route for CrocsCircle.ID
 */
const server = require('../server.js');

module.exports = (req, res) => {
  server.emit('request', req, res);
};
