require('dotenv').config();
const app = require('./runtime');
const port = Number(process.env.PORT || 5003);
app.listen(port, () => console.log(`Voice service listening on ${port}`));
