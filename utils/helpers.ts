export function calculatePercentageComplete(totalPages:number, currentPage:number) {
  if (totalPages === 0) {
    // Handle potential division by zero
    return 0;
  }

  const percentage = (currentPage / totalPages) * 100;
  return Math.round(percentage); // Round to whole number percentage
}