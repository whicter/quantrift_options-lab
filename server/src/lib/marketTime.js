const NEW_YORK_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function newYorkDate(value = new Date()) {
  return NEW_YORK_DATE_FORMATTER.format(new Date(value));
}

module.exports = { newYorkDate };
