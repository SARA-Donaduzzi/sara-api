import { EmailScheduler } from "./infrastructure/jobs/emailScheduler";

const app = require("./app");

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Iniciar agendador de emails programados
  const emailScheduler = EmailScheduler.getInstance();
  emailScheduler.start();
});
