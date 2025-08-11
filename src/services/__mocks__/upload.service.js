export const copyFileFromUrlToCloudinary = jest.fn().mockResolvedValue({
  secure_url: 'http://mocked.com/cv.pdf',
  public_id: 'mocked_public_id',
});
