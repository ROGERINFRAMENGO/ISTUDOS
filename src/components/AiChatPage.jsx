import TutorChat from './TutorChat';

// A aba "Tutor IA" usa exatamente o mesmo chat que aparece dentro da lição
// (componente TutorChat) — assim o histórico é um só e a IA já conhece o aluno.
export default function AiChatPage({
  studentState = {},
  todayLessons = [],
  completedLessonIds = [],
  onOpenSimulado,
}) {
  return (
    <TutorChat
      title="Tutor IA"
      studentState={studentState}
      todayLessons={todayLessons}
      completedLessonIds={completedLessonIds}
      onOpenSimulado={onOpenSimulado}
    />
  );
}
