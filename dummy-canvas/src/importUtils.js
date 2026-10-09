
export function getNewAssignments(assignments, importedIds) {
  return assignments.filter(
    (assignment) => !importedIds.includes(assignment.id)
  );
}

export function getImportSummary(assignments, importedIds) {
  const newAssignments = getNewAssignments(
    assignments,
    importedIds
  );

  return {
    imported: newAssignments.length,
    skipped: assignments.length - newAssignments.length,
    newIds: newAssignments.map((assignment) => assignment.id),
  };
}
