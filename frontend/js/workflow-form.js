// Workflow form management
import { AVAILABLE_IMAGES } from './config.js';
import { showNotification, showConfirmDialog, showTab } from './ui.js';
import { createWorkflow } from './api.js';
import { getUserId } from './utils.js';
import { loadWorkflows } from './workflows.js';
import { startAutoRefresh } from './refresh.js';

export function updateAvailableImages() {
    const list = document.getElementById('availableImages');
    if (!list) return;
    
    list.innerHTML = AVAILABLE_IMAGES.map(img => 
        `<li><strong>${img.name}</strong> - ${img.description}</li>`
    ).join('');
}

export function addJob() {
    const jobsList = document.getElementById('jobsList');
    const noJobsMessage = document.getElementById('noJobsMessage');
    const jobIndex = jobsList.children.length;
    
    // Hide "no jobs" message
    if (noJobsMessage) noJobsMessage.style.display = 'none';
    
    const jobDiv = document.createElement('div');
    jobDiv.className = 'rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800';
    jobDiv.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <h4 class="text-base font-semibold text-gray-800 dark:text-white/90">Job ${jobIndex + 1}</h4>
            <button 
                type="button" 
                class="flex h-8 w-8 items-center justify-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-500 dark:hover:bg-error-500/15" 
                onclick="this.closest('.rounded-lg').remove(); checkJobsList()" 
                title="Remove this job"
            >
                <svg class="fill-current" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.21967 5.28131C5.92678 4.98841 5.92678 4.51354 6.21967 4.22065C6.51256 3.92775 6.98744 3.92775 7.28033 4.22065L8 4.94033L8.71967 4.22065C9.01256 3.92775 9.48744 3.92775 9.78033 4.22065C10.0732 4.51354 10.0732 4.98841 9.78033 5.28131L9.06066 6L9.78033 6.71869C10.0732 7.01159 10.0732 7.48646 9.78033 7.77935C9.48744 8.07225 9.01256 8.07225 8.71967 7.77935L8 7.05967L7.28033 7.77935C6.98744 8.07225 6.51256 8.07225 6.21967 7.77935C5.92678 7.48646 5.92678 7.01159 6.21967 6.71869L6.93934 6L6.21967 5.28131Z" fill=""/>
                </svg>
            </button>
        </div>
        
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Job ID
                </label>
                <input 
                    type="text" 
                    name="job_id_${jobIndex}" 
                    placeholder="Auto: job-${jobIndex + 1}"
                    class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                >
            </div>
            
            <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Job Type <span class="text-error-500">*</span>
                </label>
                <select 
                    name="job_type_${jobIndex}" 
                    required 
                    oninvalid="this.setCustomValidity('Job type is required')" 
                    oninput="this.setCustomValidity('')"
                    class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                    <option value="">-- Select Type --</option>
                    <option value="cell_segmentation">Cell Segmentation</option>
                    <option value="tissue_mask">Tissue Mask</option>
                </select>
            </div>
        </div>
        
        <div class="mt-4">
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Image File <span class="text-error-500">*</span>
            </label>
            <select 
                name="image_path_${jobIndex}" 
                required 
                oninvalid="this.setCustomValidity('Please select an image file')" 
                oninput="this.setCustomValidity('')"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
                <option value="">-- Select Image --</option>
                ${AVAILABLE_IMAGES.map(img => 
                    `<option value="${img.path}" ${img.recommended ? 'data-recommended="true"' : ''}>${img.name} - ${img.description}</option>`
                ).join('')}
            </select>
            <small class="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Or enter custom path: 
                <input 
                    type="text" 
                    name="image_path_custom_${jobIndex}" 
                    placeholder="Custom path..." 
                    class="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                >
            </small>
        </div>
        
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4">
            <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Branch <span class="text-error-500">*</span>
                </label>
                <input 
                    type="text" 
                    name="branch_${jobIndex}" 
                    placeholder="e.g., branch-1" 
                    required 
                    oninvalid="this.setCustomValidity('Branch is required')" 
                    oninput="this.setCustomValidity('')"
                    class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                >
            </div>
            
            <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Depends On
                </label>
                <input 
                    type="text" 
                    name="depends_on_${jobIndex}" 
                    placeholder="job-1, job-2 (optional)"
                    class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                >
            </div>
        </div>
    `;
    
    jobsList.appendChild(jobDiv);
    
    // Handle custom image path
    const customInput = jobDiv.querySelector(`input[name="image_path_custom_${jobIndex}"]`);
    const selectInput = jobDiv.querySelector(`select[name="image_path_${jobIndex}"]`);
    if (customInput && selectInput) {
        customInput.addEventListener('input', (e) => {
            if (e.target.value) {
                selectInput.value = e.target.value;
            }
        });
    }
}

export function checkJobsList() {
    const jobsList = document.getElementById('jobsList');
    const noJobsMessage = document.getElementById('noJobsMessage');
    if (jobsList.children.length === 0 && noJobsMessage) {
        noJobsMessage.style.display = 'block';
    }
}

export function resetForm() {
    showConfirmDialog(
        'Are you sure you want to reset the form? All entered data will be lost.',
        () => {
            document.getElementById('workflowForm').reset();
            document.getElementById('jobsList').innerHTML = '';
            checkJobsList();
            
            // Reset submit button state
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '🚀 Submit Workflow';
            }
        }
    );
}

export async function handleSubmitWorkflow(e) {
    e.preventDefault();
    const userId = getUserId();
    
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const workflowName = document.getElementById('workflowName').value;
    
    // Collect jobs
    const jobs = [];
    const jobCount = document.getElementById('jobsList').children.length;
    
    if (jobCount === 0) {
        showNotification('Please add at least one job to the workflow', 'error');
        return;
    }
    
    for (let i = 0; i < jobCount; i++) {
        const jobId = formData.get(`job_id_${i}`) || `job-${i + 1}`;
        const jobType = formData.get(`job_type_${i}`);
        let imagePath = formData.get(`image_path_${i}`);
        const customPath = formData.get(`image_path_custom_${i}`);
        const branch = formData.get(`branch_${i}`);
        const dependsOnStr = formData.get(`depends_on_${i}`) || '';
        const dependsOn = dependsOnStr ? dependsOnStr.split(',').map(s => s.trim()).filter(s => s) : [];
        
        // Use custom path if provided
        if (customPath) {
            imagePath = customPath;
        }
        
        if (!jobType || !imagePath || !branch) {
            showNotification(`Job ${i + 1} is missing required fields`, 'error');
            return;
        }
        
        jobs.push({
            job_id: jobId,
            job_type: jobType,
            image_path: imagePath,
            branch: branch,
            depends_on: dependsOn
        });
    }

    const workflowData = {
        name: workflowName,
        jobs: jobs
    };

    // Disable submit button
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Submitting...';

    try {
        const workflow = await createWorkflow(workflowData);
        showNotification(`Workflow "${workflowName}" created successfully!`, 'success');
        
        // Reset form and button state immediately
        e.target.reset();
        document.getElementById('jobsList').innerHTML = '';
        checkJobsList();
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Submit Workflow';
        
        // Switch to workflows tab and immediately refresh
        showTab('workflows');
        
        // Immediately load workflows to show the new one
        await loadWorkflows();
        
        // Start auto-refresh
        startAutoRefresh();
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Submit Workflow';
    }
}

// Make functions available globally for onclick handlers
window.addJob = addJob;
window.checkJobsList = checkJobsList;
window.resetForm = resetForm;

