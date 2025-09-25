// NemOS UX Feedback Console v1.0
// This is a centralized library for creating consistent UI feedback components.
// It attaches itself to the window.NemOS object.

(function() {
    // --- INITIALIZATION ---
    if (!window.NemOS) {
        window.NemOS = {};
    }

    const feedback = {};
    window.NemOS.feedback = feedback;

    // --- STYLES ---
    const styles = `
        .nemos-toast-container {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .nemos-toast {
            display: flex;
            align-items: center;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: toast-fade-in 0.3s ease;
        }
        .nemos-toast.success { background-color: #2f855a; }
        .nemos-toast.error { background-color: #c53030; }
        .nemos-toast.info { background-color: #2b6cb0; }
        .nemos-toast.warning { background-color: #dd6b20; }
        .nemos-toast-icon { margin-right: 10px; }

        .nemos-modal-backdrop {
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 998;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: backdrop-fade-in 0.2s ease;
        }
        .nemos-modal-content {
            background-color: #2d3748; /* bg-gray-800 */
            color: #e2e8f0; /* text-gray-200 */
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            width: 90%;
            max-width: 500px;
            animation: modal-scale-in 0.2s ease-out;
        }
         .nemos-modal-content.large { max-width: 800px; }
        .nemos-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .nemos-modal-title { font-size: 1.25rem; font-weight: bold; }
        .nemos-modal-close-btn {
            background: none;
            border: none;
            color: #a0aec0; /* text-gray-500 */
            cursor: pointer;
            padding: 4px;
        }
        .nemos-modal-close-btn:hover { color: #ffffff; }

        @keyframes toast-fade-in {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes backdrop-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modal-scale-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- TOASTS ---
    let toastContainer = null;
    feedback.showToast = (message, type = 'info', duration = 3000) => {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'nemos-toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `nemos-toast ${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            info: 'ℹ',
            warning: '⚠'
        };
        
        toast.innerHTML = `<span class="nemos-toast-icon">${icons[type]}</span> ${message}`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
                toastContainer = null;
            }
        }, duration);
    };

    // --- MODALS ---
    feedback.showModal = (title, content, options = {}) => {
        const { size = 'normal', isRawContent = false } = options;
        
        const backdrop = document.createElement('div');
        backdrop.className = 'nemos-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = `nemos-modal-content ${size}`;

        const header = document.createElement('div');
        header.className = 'nemos-modal-header';
        header.innerHTML = `<h2 class="nemos-modal-title">${title}</h2>`;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'nemos-modal-close-btn';
        closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        
        const modalBody = document.createElement('div');
        if (typeof content === 'string') {
            if(isRawContent) modalBody.innerHTML = content;
            else modalBody.textContent = content;
        } else {
            modalBody.appendChild(content);
        }

        header.appendChild(closeBtn);
        modal.appendChild(header);
        modal.appendChild(modalBody);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        const closeModal = () => backdrop.remove();
        
        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });

        // Return a simple controller object
        const controller = modal;
        controller.close = closeModal;
        controller.isOpen = () => document.body.contains(backdrop);
        return controller;
    };

    // --- CONFIRMATION PROMPTS ---
    feedback.confirm = (title, message, onConfirm) => {
        const content = document.createElement('div');
        content.innerHTML = `
            <p class="text-gray-400 mb-6">${message}</p>
            <div class="mt-4 flex justify-end space-x-2">
                <button id="nemos-confirm-cancel" class="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700">Cancel</button>
                <button id="nemos-confirm-ok" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700">Confirm</button>
            </div>
        `;

        const modal = feedback.showModal(title, content);

        const cancelBtn = content.querySelector('#nemos-confirm-cancel');
        const confirmBtn = content.querySelector('#nemos-confirm-ok');

        cancelBtn.addEventListener('click', () => modal.close());
        confirmBtn.addEventListener('click', () => {
            onConfirm();
            modal.close();
        });
    };
})();

