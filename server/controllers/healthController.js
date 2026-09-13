const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "Omni-AI API"
    }
  });
};

module.exports = {
  getHealth
};