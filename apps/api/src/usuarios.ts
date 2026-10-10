// Únicos usuarios del sistema. Cambia aquí las claves antes de publicar en producción.
export const USUARIOS = [
  { email: 'dkring1@gmail.com', name: 'Ring 1', password: 'DOKANRING1', role_id: 'ring_operator' },
  { email: 'dkring2@gmail.com', name: 'Ring 2', password: 'DOKANRING2', role_id: 'ring_operator' },
  { email: 'dokan.systemgt@gmail.com', name: 'Administrador', password: 'DOKAN123', role_id: 'admin' },
  { email: 'dklocu@gmail.com', name: 'Locutor', password: 'DOKANLOCUTOR123', role_id: 'announcer' },
] as const;
