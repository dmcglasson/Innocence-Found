const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
}
const express = require('express');
const cors = require('cors');
const adminRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use('/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Innocence Found API listening on port ${PORT}`);
});
