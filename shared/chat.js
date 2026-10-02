const INTENTS = ['profile', 'leave', 'payroll', 'policy', 'users', 'leave_requests'];

function localIntent(prompt) {
  if (/\b(compliance|training|attendance)\b/i.test(prompt)) return null;
  if (/\b(update|change|set|delete|create|approve|reject|apply)\b/i.test(prompt)) return null;
  if (/\b(profile|my employee id|my email|my name|my role|my department|my manager|joined|joining date|when did i join)\b/i.test(prompt)) return 'profile';
  if (/\b(leave requests?|applications?|approvals?)\b/i.test(prompt)) return 'leave_requests';
  if (/\b(leaves?|vacation|time off|sick days?)\b/i.test(prompt)) return 'leave';
  if (/\b(salary|payroll|pay slip|payslip|ctc|hra|deduction|compensation)\b/i.test(prompt)) return 'payroll';
  if (/\b(policy|policies|work from home|wfh|holiday|holidays|expense|travel rules?)\b/i.test(prompt)) return 'policy';
  if (/\b(users?|employees?|staff|headcount|workforce)\b/i.test(prompt)) return 'users';
  return null;
}

async function classifyIntent(prompt, model) {
  if (/\b(compliance|training|attendance|update|change|set|delete|create|approve|reject|apply)\b/i.test(prompt)) return null;
  const direct = localIntent(prompt);
  if (direct || !model) return direct;
  const instruction = `Classify this HR question into exactly one of: ${INTENTS.join(', ')}. Return only JSON like {"intent":"leave"}. If it does not fit, return {"intent":"unsupported"}. Question: ${JSON.stringify(prompt)}`;
  try {
    const result = await model.generateContent(instruction);
    const raw = result.response.text().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(raw);
    return INTENTS.includes(parsed.intent) ? parsed.intent : null;
  } catch {
    return null;
  }
}

function validPrompt(prompt) {
  return typeof prompt === 'string' && prompt.trim().length > 0 && prompt.length <= 1000;
}

module.exports = { classifyIntent, validPrompt };
