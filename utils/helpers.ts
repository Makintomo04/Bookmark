export function calculatePercentageComplete(totalPages:number, currentPage:number) {
  if (totalPages === 0) {
    // Handle potential division by zero
    return 0;
  }

  const percentage = (currentPage / totalPages) * 100;
  return Math.round(percentage); // Round to whole number percentage
}

export enum STEPS {
  START= 0,
  USERNAME= 1,
  IMAGE= 2,
  BANNER= 3,
  BIO= 4,
  COLOUR= 5,
  COMPLETE= 6
}  