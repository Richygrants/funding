const { handleApplicationSubmission } = require("../server/telegram-handler");

module.exports = async function submitApplication(req, res) {
  const result = await handleApplicationSubmission({
    method: req.method,
    body: req.body
  });

  res.status(result.statusCode);
  for (const [name, value] of Object.entries(result.headers || {})) {
    res.setHeader(name, value);
  }
  res.end(result.body);
};
