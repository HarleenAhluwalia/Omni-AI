export function paginateTasks(
  tasks,
  currentPage,
  tasksPerPage = 5
) {
  const startIndex =
    (currentPage - 1) * tasksPerPage;

  return tasks.slice(
    startIndex,
    startIndex + tasksPerPage
  );
}

export function getTotalPages(
  taskCount,
  tasksPerPage = 5
) {
  return Math.max(
    1,
    Math.ceil(taskCount / tasksPerPage)
  );
}