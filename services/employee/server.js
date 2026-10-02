require('dotenv').config();
const app = require('./runtime');
app.listen(Number(process.env.PORT || 5002), () => console.log(`Employee service listening on ${process.env.PORT || 5002}`));
