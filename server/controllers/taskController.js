const getTasks = (req, res) => {
  const tasks = [
    {
      id: 1,
      title: "Example task",
      completed: false
    }
  ];

  res.status(200).json({
    success: true,
    data: tasks
  });
};

module.exports = {
  getTasks
};