import { jest } from '@jest/globals';

const getTextContentMock = jest.fn(async () => ({
  items: [{ str: 'Backend' }, { str: 'NodeJS' }, { str: 'MongoDB' }],
}));
const getDocumentMock = jest.fn(() => ({
  promise: Promise.resolve({
    numPages: 1,
    getPage: jest.fn(async () => ({
      getTextContent: getTextContentMock,
    })),
  }),
}));

jest.unstable_mockModule('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: getDocumentMock,
}));

jest.unstable_mockModule('mammoth', () => ({
  default: {
    extractRawText: jest.fn(async () => ({ value: 'DOCX CV text' })),
  },
}));

const { extractUploadedCVText } = await import('../../src/services/cvScoring.service.js');

describe('cvScoring uploaded CV text extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null),
      },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('downloads and extracts text from uploaded PDF CVs', async () => {
    const text = await extractUploadedCVText({
      name: 'Backend CV.pdf',
      path: 'https://example.com/backend-cv.pdf',
    });

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/backend-cv.pdf');
    expect(getDocumentMock).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(text).toBe('Backend NodeJS MongoDB');
  });
});
