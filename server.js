const app = require('./src');

const port = Number(process.env.PORT || 4173);

app.listen(port, () => {
  console.log(`Clock Keeper running at http://127.0.0.1:${port}`);
});
