import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { comparisonService } from '../services/comparison.service';

/**
 * POST /api/comparison
 * Compares two documents at clause/paragraph level and identifies substantive changes.
 * Input: { "documentA": "id", "documentB": "id" } (or docAId, docBId)
 */
export const compareDocuments = async (req: Request, res: Response) => {
  try {
    const docAId = req.body.documentA || req.body.docAId;
    const docBId = req.body.documentB || req.body.docBId;

    if (!docAId || !docBId) {
      return res.status(400).json({
        success: false,
        error: 'Both documentA and documentB IDs are required for comparison.',
      });
    }

    const [docA, docB] = await Promise.all([
      prisma.document.findUnique({ where: { id: docAId } }),
      prisma.document.findUnique({ where: { id: docBId } }),
    ]);

    if (!docA) {
      return res.status(404).json({
        success: false,
        error: `Document A (${docAId}) not found.`,
      });
    }

    if (!docB) {
      return res.status(404).json({
        success: false,
        error: `Document B (${docBId}) not found.`,
      });
    }

    // Retrieve full text, falling back to chunks if extractedText is empty
    let textA = docA.extractedText || '';
    if (!textA.trim()) {
      const chunksA = await prisma.documentChunk.findMany({
        where: { documentId: docA.id },
        orderBy: { chunkIndex: 'asc' },
      });
      textA = chunksA.map((c) => c.text).join('\n\n');
    }

    let textB = docB.extractedText || '';
    if (!textB.trim()) {
      const chunksB = await prisma.documentChunk.findMany({
        where: { documentId: docB.id },
        orderBy: { chunkIndex: 'asc' },
      });
      textB = chunksB.map((c) => c.text).join('\n\n');
    }

    if (!textA.trim() || !textB.trim()) {
      return res.status(400).json({
        success: false,
        error: 'One or both contracts have no extracted text to compare. Please ensure they are processed.',
      });
    }

    const comparisonResult = await comparisonService.compare(
      {
        id: docA.id,
        title: docA.title,
        fileName: docA.fileName,
        text: textA,
      },
      {
        id: docB.id,
        title: docB.title,
        fileName: docB.fileName,
        text: textB,
      }
    );

    // Structure the response to satisfy requirement 21 & 22
    // Output: clause, oldText, newText, summary, significance
    return res.status(200).json({
      success: true,
      data: comparisonResult,
      executiveSummary: comparisonResult.executiveSummary,
      totalChanges: comparisonResult.totalChanges,
      counts: comparisonResult.counts,
      comparisons: comparisonResult.comparisons,
      changes: comparisonResult.comparisons.map((c) => ({
        clause: c.clause,
        oldText: c.oldText,
        newText: c.newText,
        summary: c.summary,
        significance: c.significance,
        changeType: c.changeType,
      })),
    });
  } catch (error: any) {
    console.error('Error comparing documents:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred while comparing contracts.',
    });
  }
};

export const getComparisonHistory = async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: [],
    message: 'Comparison history endpoint ready.',
  });
};
