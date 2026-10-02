export class ComparisonService {
  async compare(docAId: string, docBId: string) {
    return {
      docAId,
      docBId,
      differences: [],
      similarities: [],
    };
  }
}

export const comparisonService = new ComparisonService();
