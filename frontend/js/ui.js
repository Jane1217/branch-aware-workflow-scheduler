// UI utility functions (notifications, dialogs, tabs)
import { escapeHtml } from './utils.js';

export function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.tailadmin-notification');
    if (existing) existing.remove();
    
    // TailAdmin notification styling
    let bgColor = 'bg-gray-50';
    let textColor = 'text-gray-800';
    let borderColor = 'border-gray-200';
    
    if (type === 'success') {
        bgColor = 'bg-success-50';
        textColor = 'text-success-600';
        borderColor = 'border-success-200';
    } else if (type === 'error') {
        bgColor = 'bg-error-50';
        textColor = 'text-error-600';
        borderColor = 'border-error-200';
    } else if (type === 'warning') {
        bgColor = 'bg-orange-50';
        textColor = 'text-orange-600';
        borderColor = 'border-orange-200';
    }
    
    const notification = document.createElement('div');
    notification.className = `tailadmin-notification fixed top-4 right-4 z-999999 flex items-center gap-3 rounded-lg border ${borderColor} ${bgColor} px-4 py-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900`;
    notification.innerHTML = `
        <span class="${textColor} text-sm font-medium dark:text-white/90">${escapeHtml(message)}</span>
        <button onclick="this.closest('.tailadmin-notification').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="fill-current" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M6.21967 5.28131C5.92678 4.98841 5.92678 4.51354 6.21967 4.22065C6.51256 3.92775 6.98744 3.92775 7.28033 4.22065L8 4.94033L8.71967 4.22065C9.01256 3.92775 9.48744 3.92775 9.78033 4.22065C10.0732 4.51354 10.0732 4.98841 9.78033 5.28131L9.06066 6L9.78033 6.71869C10.0732 7.01159 10.0732 7.48646 9.78033 7.77935C9.48744 8.07225 9.01256 8.07225 8.71967 7.77935L8 7.05967L7.28033 7.77935C6.98744 8.07225 6.51256 8.07225 6.21967 7.77935C5.92678 7.48646 5.92678 7.01159 6.21967 6.71869L6.93934 6L6.21967 5.28131Z" fill=""/>
            </svg>
        </button>
    `;
    document.body.appendChild(notification);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export function showConfirmDialog(message, onConfirm, onCancel = null) {
    // Create modal with TailAdmin styling
    const modal = document.createElement('div');
    modal.className = 'fixed left-0 top-0 z-999999 flex h-screen w-screen items-center justify-center bg-gray-900/50 dark:bg-black/50';
    modal.innerHTML = `
        <div class="relative max-w-[500px] w-full mx-4 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Confirm</h3>
                <button 
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                    onclick="this.closest('.fixed').remove()"
                >
                    <svg class="fill-current" width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill=""/>
                    </svg>
                </button>
            </div>
            <div class="px-5 py-4">
                <p class="text-sm text-gray-800 dark:text-white/90">${escapeHtml(message)}</p>
            </div>
            <div class="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
                <button 
                    class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    onclick="this.closest('.fixed').remove()"
                >
                    Cancel
                </button>
                <button 
                    id="confirmBtn"
                    class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
                >
                    Confirm
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle confirm button
    const confirmBtn = modal.querySelector('#confirmBtn');
    confirmBtn.onclick = () => {
        modal.remove();
        if (onConfirm) onConfirm();
    };
    
    // Handle cancel button
    const cancelBtn = modal.querySelector('button:not(#confirmBtn)');
    if (onCancel && cancelBtn) {
        cancelBtn.onclick = () => {
            modal.remove();
            if (onCancel) onCancel();
        };
    }
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            if (onCancel) onCancel();
        }
    };
}

export function showTab(tabName) {
    // For TailAdmin, tabs are controlled by Alpine.js x-show
    // Update Alpine data if available
    try {
        const body = document.body;
        if (body && body.__x && body.__x.$data) {
            body.__x.$data.activeTab = tabName;
        }
    } catch (e) {
        // Fallback: use DOM manipulation if Alpine not available
        document.querySelectorAll('[x-show*="activeTab"]').forEach(el => {
            el.style.display = 'none';
        });
        const targetTab = document.querySelector(`[x-show="activeTab === '${tabName}'"]`);
        if (targetTab) {
            targetTab.style.display = 'block';
        }
    }
}

