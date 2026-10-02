require('dotenv').config();
const app = require('./runtime');
app.listen(Number(process.env.PORT || 5001), () => console.log(`Admin service listening on ${process.env.PORT || 5001}`));
