const { ZodError } = require('zod');

const validate = (schema) => async (req, res, next) => {
  try {
    const validatedData = await schema.parseAsync(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));

      return res.status(400).json({
        success: false,
        message: formattedErrors[0]?.message || 'Validation failed',
        errors: formattedErrors
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid request data'
    });
  }
};

module.exports = {
  validate
};
