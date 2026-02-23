type SelectionRange = {
  from: number;
  to: number;
};

function isValidSelectionRange(selection: SelectionRange): boolean {
  return (
    Number.isInteger(selection.from) &&
    Number.isInteger(selection.to) &&
    selection.from >= 0 &&
    selection.to >= selection.from
  );
}

export function getRestorableSelection(
  previousSelection: SelectionRange,
  maxPosition: number,
): SelectionRange | null {
  if (!Number.isInteger(maxPosition) || maxPosition < 0) return null;
  if (!isValidSelectionRange(previousSelection)) return null;
  if (
    previousSelection.from > maxPosition ||
    previousSelection.to > maxPosition
  ) {
    return null;
  }
  return previousSelection;
}
