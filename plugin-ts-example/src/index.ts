
import { Plugin, ServerAPI } from '../../src/interfaces/plugins';

module.exports= (server: ServerAPI): Plugin=> {

    let config: object;     // ** applied configuration settings          

    let plugin: Plugin= { 
        id: 'my-plugin-id',
        name: 'My plugin (this is the name that appears in Plugin Config screen.)',
        schema: ()=> ({
            properties: {
                myAttribute: {
                    type: "string",
                    title: "Title text",
                    default: "No value has been entered."
                }                
            }
        }),

        start: function(options: any) {
            config= options;
            try {
                server.debug(`** ${this.name} starting.......`);
                // do startup actions here.	
                server.setProviderStatus('Started');	
            } 
            catch(err) {
                server.setProviderError(`Started with errors!`);
                server.error('** EXCEPTION: **');
                server.error(err.stack);
                return err;
            }   
        },

        stop: function() {
            server.debug(`** ${this.name} stopping.......`);
            // do clean up actions here.
            server.setProviderStatus('Stopped');
        }
    }
   
    return plugin;
}