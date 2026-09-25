import { useMemo, useState } from "react";

function CalendarView() {
  const today = new Date();

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const calendarCells = useMemo(() => {
    const cells = [];

    for (let i = 0; i < firstDayOfMonth; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [firstDayOfMonth, daysInMonth]);

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(
      new Date(today.getFullYear(), today.getMonth(), 1)
    );
  };

  const isToday = (day) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  return (
    <section className="calendar-page">
      <div className="calendar-view-header">
        <div>
          <h1>{monthLabel}</h1>
          <p>View your Omni AI schedule.</p>
        </div>

        <div className="calendar-navigation">
          <button onClick={previousMonth}>Previous</button>
          <button onClick={goToToday}>Today</button>
          <button onClick={nextMonth}>Next</button>
        </div>
      </div>

      <div className="full-calendar-grid">
        {[
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ].map((dayName) => (
          <div
            key={dayName}
            className="full-calendar-heading"
          >
            {dayName}
          </div>
        ))}

        {calendarCells.map((day, index) => (
          <div
            key={`${year}-${month}-${index}`}
            className={
              isToday(day)
                ? "full-calendar-day current-day"
                : "full-calendar-day"
            }
          >
            {day && (
              <div className="full-calendar-date">
                {day}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default CalendarView;