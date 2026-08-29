const { handleApplicationSubmission } = require("../../server/telegram-handler");

exports.handler = async (event) => {
  return handleApplicationSubmission({
    method: event.httpMethod,
    body: event.body
  });
};
