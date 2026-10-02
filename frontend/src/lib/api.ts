const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function fetchDocuments() {
  const res = await fetch(`${API_BASE_URL}/documents`);
  return res.json();
}

export async function uploadDocument(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
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
