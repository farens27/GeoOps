import { createSignal, onMount, Show } from 'solid-js';
import { AuthGuard, DataTable, StatusBadge, ConfirmDialog, showToast } from '~/components';
import { api } from '~/lib/api-client';

export default function Workers() {
  const [workers, setWorkers] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Modal State
  const [showModal, setShowModal] = createSignal(false);
  const [editingWorker, setEditingWorker] = createSignal<any>(null);
  
  // Form State
  const [formData, setFormData] = createSignal({
    name: '',
    role: '',
    team: '',
    phone: '',
    status: 'ACTIVE'
  });

  // Delete Confirm State
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [workerToDelete, setWorkerToDelete] = createSignal<any>(null);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: any[] }>('/api/workers');
      if (res && res.data) setWorkers(res.data);
    } catch (err) {
      showToast('Failed to fetch workers', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchWorkers);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'team', label: 'Team' },
    { key: 'phone', label: 'Phone' },
    { 
      key: 'status', 
      label: 'Status',
      render: (val: string) => <StatusBadge status={val as any} />
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_: any, row: any) => (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            class="btn" 
            style={{ padding: "0.25rem 0.5rem", "font-size": "0.75rem", background: "var(--bg-tertiary)" }}
            onClick={() => handleEditClick(row)}
          >
            Edit
          </button>
          <button 
            class="btn btn-danger" 
            style={{ padding: "0.25rem 0.5rem", "font-size": "0.75rem" }}
            onClick={() => handleDeleteClick(row)}
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  const handleEditClick = (worker: any) => {
    setEditingWorker(worker);
    setFormData({
      name: worker.name,
      role: worker.role,
      team: worker.team,
      phone: worker.phone || '',
      status: worker.status
    });
    setShowModal(true);
  };

  const handleAddClick = () => {
    setEditingWorker(null);
    setFormData({
      name: '',
      role: '',
      team: '',
      phone: '',
      status: 'ACTIVE'
    });
    setShowModal(true);
  };

  const handleDeleteClick = (worker: any) => {
    setWorkerToDelete(worker);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!workerToDelete()) return;
    try {
      await api.delete(`/api/workers/${workerToDelete().id}`);
      showToast('Worker deleted successfully', 'success');
      fetchWorkers();
    } catch (err) {
      showToast('Failed to delete worker', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setWorkerToDelete(null);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    try {
      if (editingWorker()) {
        await api.put(`/api/workers/${editingWorker().id}`, { worker: formData() });
        showToast('Worker updated successfully', 'success');
      } else {
        await api.post('/api/workers', { worker: formData() });
        showToast('Worker added successfully', 'success');
      }
      setShowModal(false);
      fetchWorkers();
    } catch (err) {
      showToast('Failed to save worker', 'error');
    }
  };

  return (
    <AuthGuard>
      <div style={{ padding: "2rem" }}>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "2rem" }}>
          <h1 style={{ "font-size": "2rem", "font-weight": "bold", margin: 0 }}>Workers</h1>
          <button class="btn btn-primary" onClick={handleAddClick}>+ Add Worker</button>
        </div>

        <DataTable 
          data={workers()} 
          columns={columns} 
          loading={loading()} 
          emptyMessage="No workers found. Add one to get started." 
        />

        {/* Form Modal */}
        <Show when={showModal()}>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", "backdrop-filter": "blur(4px)", "z-index": 50, display: "flex", "align-items": "center", "justify-content": "center", padding: "1rem" }}>
            <div class="card bg-glass border-glass" style={{ width: "100%", "max-width": "500px", padding: "2rem" }}>
              <h2 style={{ "margin-top": 0, "margin-bottom": "1.5rem" }}>
                {editingWorker() ? 'Edit Worker' : 'Add Worker'}
              </h2>
              
              <form onSubmit={handleSubmit}>
                <div class="form-group">
                  <label>Name</label>
                  <input class="form-input" required value={formData().name} onInput={(e) => setFormData({...formData(), name: e.currentTarget.value})} />
                </div>
                <div class="form-group">
                  <label>Role</label>
                  <input class="form-input" required value={formData().role} onInput={(e) => setFormData({...formData(), role: e.currentTarget.value})} />
                </div>
                <div class="form-group">
                  <label>Team</label>
                  <input class="form-input" required value={formData().team} onInput={(e) => setFormData({...formData(), team: e.currentTarget.value})} />
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input class="form-input" value={formData().phone} onInput={(e) => setFormData({...formData(), phone: e.currentTarget.value})} />
                </div>
                <div class="form-group">
                  <label>Status</label>
                  <select class="form-input" value={formData().status} onChange={(e) => setFormData({...formData(), status: e.currentTarget.value})}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                
                <div style={{ display: "flex", "justify-content": "flex-end", gap: "1rem", "margin-top": "2rem" }}>
                  <button type="button" class="btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Worker</button>
                </div>
              </form>
            </div>
          </div>
        </Show>

        <ConfirmDialog
          isOpen={showDeleteConfirm()}
          title="Delete Worker"
          message={`Are you sure you want to delete ${workerToDelete()?.name}? This cannot be undone.`}
          variant="danger"
          confirmText="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </div>
    </AuthGuard>
  );
}
