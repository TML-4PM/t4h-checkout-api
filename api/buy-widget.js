const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 's-maxage=3600');
  
  const widgetPath = path.join(__dirname, '..', 'public', 'buy-widget.js');
  try {
    const content = fs.readFileSync(widgetPath, 'utf8');
    res.status(200).send(content);
  } catch(e) {
    res.status(404).send('// Widget not found');
  }
};
