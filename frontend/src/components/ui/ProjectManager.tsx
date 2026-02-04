import { useState, useEffect, useCallback } from 'react';
import type { Project } from '@/types';
import { listProjects, createProject, deleteProject, openProject } from '@/lib/api';

interface ProjectManagerProps {
  onOpenProject: (project: Project) => void;
}

/**
 * Project manager view for creating and selecting annotation projects.
 */
export function ProjectManager({ onOpenProject }: ProjectManagerProps): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const projectList = await listProjects();
      setProjects(projectList);
      setError(null);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async (): Promise<void> => {
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      const project = await createProject({ name: newProjectName.trim() });
      setNewProjectName('');
      // Open the newly created project
      const openedProject = await openProject(project.id);
      onOpenProject(openedProject);
    } catch {
      setError('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenProject = async (project: Project): Promise<void> => {
    try {
      const openedProject = await openProject(project.id);
      onOpenProject(openedProject);
    } catch {
      setError('Failed to open project');
    }
  };

  const handleDeleteProject = async (project: Project): Promise<void> => {
    if (!confirm(`Delete "${project.name}" and all its data? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteProject(project.id);
      await loadProjects();
    } catch {
      setError('Failed to delete project');
    }
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-8 dark:bg-gray-900">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bbannotate</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Bounding box annotation tool for image datasets
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">
              ×
            </button>
          </div>
        )}

        {/* Create new project */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Create New Project
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              placeholder="Enter project name..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              disabled={creating}
            />
            <button
              onClick={handleCreateProject}
              disabled={creating || !newProjectName.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Recent projects */}
        <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Recent Projects
          </h2>

          {loading ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              <svg
                className="mx-auto mb-3 h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <p>No projects yet</p>
              <p className="text-sm">Create a new project to get started</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {projects.map((project) => (
                <li key={project.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleOpenProject(project)}
                      className="flex-1 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-3 px-3 py-2 rounded-lg transition-colors"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {project.name}
                      </div>
                      <div className="mt-1 flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span>{project.image_count} images</span>
                        <span>{project.annotation_count} annotations</span>
                        <span>Last opened: {formatDate(project.last_opened)}</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteProject(project)}
                      className="ml-2 rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Delete project"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
