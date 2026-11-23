export const logRequestError = (message, error) => {
  console.error(message, { code: error?.code, status: error?.response?.status })
}
