const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'PROCESSING' | 'READY' | 'FAILED' | string;
  pageCount?: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    chunks: number;
    conversations: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  count?: number;
}

export async function fetchDocuments(): Promise<ApiResponse<DocumentItem[]>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents`, { cache: 'no-store' });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch documents',
      data: [],
    };
  }
}

export async function fetchDocumentById(id: string): Promise<ApiResponse<any>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, { cache: 'no-store' });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch document',
    };
  }
}

export async function uploadDocument(file: File): Promise<ApiResponse<DocumentItem>> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error while uploading document',
    };
  }
}

export async function deleteDocument(id: string): Promise<ApiResponse<{ id: string }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to delete document',
    };
  }
}

export async function sendChatMessage(documentId: string, message: string) {
  const res = await fetch(`${API_BASE_URL}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, message }),
  });
  return res.json();
}

export async function compareContracts(docAId: string, docBId: string) {
  const res = await fetch(`${API_BASE_URL}/comparison/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docAId, docBId }),
  });
  return res.json();
}
